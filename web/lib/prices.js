// Price source: Binance public klines API. See backend/src/services/prices.js
// for the rationale (CoinGecko gated /coins/{id}/history in late 2024;
// Binance is public, key-free, 1200 req/min headroom). This is the cloud
// port — async cache reads/writes via Neon, but the strategy is identical:
//
//   1. {SYMBOL}EUR direct pair on Binance.
//   2. {SYMBOL}USDT × USDT→EUR derived from 1/EURUSDT.
//   3. cache 0 + source='failed' if neither works.
//
// Cache hits with source='failed' are treated as misses so transient blips
// don't permanently zero-out trades.

import { sql } from './db/index.js'

// ---------------------------------------------------------------------------
// Throttling — chain-based queue
// ---------------------------------------------------------------------------
let tail = Promise.resolve()
const MIN_DELAY_MS = 200

function throttle() {
  const prev = tail
  tail = (async () => {
    await prev
    await sleep(MIN_DELAY_MS)
  })()
  return prev
}

// ---------------------------------------------------------------------------
// In-flight deduplication
// ---------------------------------------------------------------------------
const inflight = new Map()

/**
 * Returns the EUR price for `crypto` on `dateStr` (YYYY-MM-DD).
 */
export async function getPriceEur(crypto, dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Invalid dateStr format: "${dateStr}". Expected YYYY-MM-DD.`)
  }
  const symbol = crypto.toUpperCase()
  if (symbol === 'EUR') return 1

  // 1. Cache. Skip rows with source='failed' so a transient blip doesn't
  // permanently zero-out every trade referencing this symbol/date.
  const cached = await sql`
    SELECT price_eur, source FROM price_cache
    WHERE crypto = ${symbol} AND date = ${dateStr}
  `
  if (cached.length > 0 && cached[0].source !== 'failed') {
    return Number(cached[0].price_eur)
  }

  // 2. In-flight dedup
  const key = `${symbol}_${dateStr}`
  if (inflight.has(key)) return inflight.get(key)

  const promise = (async () => {
    let price = 0
    let source = 'failed'
    try {
      const result = await fetchFromBinance(symbol, dateStr)
      price = result.price
      source = result.source
    } catch (err) {
      console.warn(`[prices] ${symbol} ${dateStr} fetch failed: ${err.message} — caching 0 EUR`)
    }

    await sql`
      INSERT INTO price_cache (crypto, date, price_eur, source, fetched_at)
      VALUES (${symbol}, ${dateStr}, ${price}, ${source}, NOW())
      ON CONFLICT (crypto, date) DO UPDATE
      SET price_eur = EXCLUDED.price_eur,
          source = EXCLUDED.source,
          fetched_at = EXCLUDED.fetched_at
    `

    console.log(`[prices] ${symbol} ${dateStr} -> €${price} (${source})`)
    return price
  })().then(value => {
    inflight.delete(key)
    return value
  }, err => {
    inflight.delete(key)
    throw err
  })

  inflight.set(key, promise)
  return promise
}

async function fetchFromBinance(symbol, dateStr) {
  const startMs = Date.parse(`${dateStr}T00:00:00Z`)
  if (Number.isNaN(startMs)) throw new Error(`Cannot parse date '${dateStr}'`)
  const endMs = startMs + 86_399_999

  const direct = await fetchKlineClose(`${symbol}EUR`, startMs, endMs)
  if (direct !== null) return { price: direct, source: 'binance-direct' }

  if (symbol === 'USDT') {
    const eurUsdt = await fetchKlineClose('EURUSDT', startMs, endMs)
    if (eurUsdt && eurUsdt > 0) {
      return { price: 1 / eurUsdt, source: 'binance-usdt-derived' }
    }
    console.warn(`[prices] No EURUSDT kline for ${dateStr}, returning 0 EUR`)
    return { price: 0, source: 'failed' }
  }

  const symbolUsdt = await fetchKlineClose(`${symbol}USDT`, startMs, endMs)
  if (symbolUsdt !== null) {
    const usdtEur = await getPriceEur('USDT', dateStr)
    if (usdtEur > 0) {
      return { price: symbolUsdt * usdtEur, source: 'binance-usdt-derived' }
    }
  }

  console.warn(`[prices] No Binance market for ${symbol} on ${dateStr}, returning 0 EUR`)
  return { price: 0, source: 'failed' }
}

async function fetchKlineClose(pair, startMs, endMs) {
  await throttle()
  const url =
    `https://api.binance.com/api/v3/klines` +
    `?symbol=${pair}&interval=1d&startTime=${startMs}&endTime=${endMs}&limit=1`

  const res = await fetch(url, { headers: { 'User-Agent': 'fifo-paez/1.0' } })
  if (res.status === 400) return null // invalid symbol
  if (!res.ok) throw new Error(`HTTP ${res.status} from Binance for ${pair}`)

  const body = await res.json()
  if (!Array.isArray(body) || body.length === 0) return null
  const close = parseFloat(body[0][4])
  if (!Number.isFinite(close) || close <= 0) return null
  return close
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Pre-fetches a deduplicated batch of (symbol, dateStr) prices into the cache.
 * Reports progress via the optional onProgress callback so callers can stream
 * status to the UI in Slice 2.5 (SSE) or surface in import response.
 *
 * @param {Array<{symbol: string, dateStr: string}>} items
 * @param {(progress: {done, total, latest}) => void} [onProgress]
 */
export async function warmPriceCache(items, onProgress) {
  const unique = new Map()
  for (const it of items) {
    if (!it || !it.symbol || !it.dateStr) continue
    const symbol = it.symbol.toUpperCase()
    if (symbol === 'EUR') continue
    if (!/^\d{4}-\d{2}-\d{2}$/.test(it.dateStr)) continue
    unique.set(`${symbol}_${it.dateStr}`, { symbol, dateStr: it.dateStr })
  }

  if (unique.size === 0) return { total: 0, fetched: 0 }

  const pairs = Array.from(unique.values())
  console.log(`[prices] Warming cache: ${pairs.length} unique (symbol, date) pairs`)

  let done = 0
  for (const { symbol, dateStr } of pairs) {
    done++
    if (onProgress) onProgress({ done, total: pairs.length, latest: `${symbol} ${dateStr}` })
    if (done % 10 === 0 || done === pairs.length) {
      console.log(`[prices] [${done}/${pairs.length}] (latest: ${symbol} ${dateStr})`)
    }
    // getPriceEur is cache-aware — already-cached non-failed entries return
    // instantly without a Binance call.
    // eslint-disable-next-line no-await-in-loop
    await getPriceEur(symbol, dateStr)
  }

  return { total: pairs.length, fetched: done }
}
