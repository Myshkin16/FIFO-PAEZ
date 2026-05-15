import crypto from 'node:crypto'
import { sql } from './db/index.js'
import { getPriceEur } from './prices.js'

const KRAKEN_BASE = 'https://api.kraken.com'

// ---------------------------------------------------------------------------
// Monotonic nonce (persisted in `config` table)
// ---------------------------------------------------------------------------
// Kraken requires strictly increasing nonces per API key. Two requests within
// the same millisecond would otherwise share a nonce and break HMAC.
async function nextNonce() {
  const row = await sql`SELECT value FROM config WHERE key = 'kraken_last_nonce'`
  const lastNonce = row.length > 0 ? BigInt(row[0].value) : 0n
  const candidate = BigInt(Date.now()) * 1000n
  const next = candidate > lastNonce ? candidate : lastNonce + 1n
  await sql`
    INSERT INTO config (key, value) VALUES ('kraken_last_nonce', ${next.toString()})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `
  return next.toString()
}

// ---------------------------------------------------------------------------
// Pair normalisation
// ---------------------------------------------------------------------------

const KRAKEN_PREFIX_MAP = {
  XXBT: 'BTC', XETH: 'ETH', XLTC: 'LTC', XXLM: 'XLM', XXRP: 'XRP',
  XZEC: 'ZEC', XDASH: 'DASH',
  ZUSD: 'USD', ZEUR: 'EUR', ZGBP: 'GBP', ZCAD: 'CAD', ZJPY: 'JPY',
}

function normalisePairComponent(token) {
  return KRAKEN_PREFIX_MAP[token] || token
}

function extractBaseQuote(pair) {
  if (pair.length === 8) {
    return {
      base: normalisePairComponent(pair.slice(0, 4)),
      quote: normalisePairComponent(pair.slice(4)),
    }
  }
  if (pair.length === 6) {
    return { base: pair.slice(0, 3), quote: pair.slice(3) }
  }
  const prefix4 = pair.slice(0, 4)
  if (KRAKEN_PREFIX_MAP[prefix4]) {
    return {
      base: KRAKEN_PREFIX_MAP[prefix4],
      quote: normalisePairComponent(pair.slice(4)),
    }
  }
  return { base: pair.slice(0, 3), quote: pair.slice(3) }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function krakenSign(path, postBody, nonce, privateKey) {
  const message = nonce + postBody
  const sha256Hash = crypto.createHash('sha256').update(message, 'utf8').digest()
  const pathBuffer = Buffer.from(path, 'utf8')
  const hmacInput = Buffer.concat([pathBuffer, sha256Hash])
  const decodedSecret = Buffer.from(privateKey, 'base64')
  return crypto.createHmac('sha512', decodedSecret).update(hmacInput).digest('base64')
}

async function krakenPost(path, params, apiKey, privateKey) {
  const nonce = await nextNonce()
  const body = new URLSearchParams({ nonce, ...params }).toString()
  const apiSign = krakenSign(path, body, nonce, privateKey)

  const res = await fetch(`${KRAKEN_BASE}${path}`, {
    method: 'POST',
    body,
    headers: {
      'API-Key': apiKey,
      'API-Sign': apiSign,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'fifo-paez/1.0',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} from Kraken`)
  const data = await res.json()
  if (data.error && data.error.length > 0) {
    throw new Error(`Kraken API error on ${path}: ${data.error.join(', ')}`)
  }
  return data.result
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

async function fetchAllTrades(apiKey, privateKey) {
  const all = {}
  let offset = 0
  const PAGE = 50
  let page = 0
  const MAX_PAGES = 200
  while (true) {
    if (++page > MAX_PAGES) throw new Error('Kraken pagination safety limit reached')
    const result = await krakenPost('/0/private/TradesHistory', { ofs: offset }, apiKey, privateKey)
    const trades = result.trades || {}
    const count = result.count || 0
    Object.assign(all, trades)
    offset += PAGE
    if (offset >= count || Object.keys(trades).length === 0) break
  }
  return all
}

export async function fetchKrakenHistory(apiKey, privateKey) {
  if (!apiKey || !privateKey) throw new Error('Kraken API credentials are required')
  const keyBuf = Buffer.from(privateKey, 'base64')
  if (keyBuf.length < 32) throw new Error('Kraken private key appears invalid (expected base64, min 32 bytes)')

  const rawTrades = await fetchAllTrades(apiKey, privateKey)
  const results = []
  const skipped = []

  for (const [tradeId, t] of Object.entries(rawTrades)) {
    const { base, quote } = extractBaseQuote(t.pair || '')
    const tradePrice = parseFloat(t.price) || 0
    const tradeDate  = new Date(t.time * 1000).toISOString()
    const dateStr    = tradeDate.slice(0, 10)

    let priceEur
    if (quote === 'EUR') {
      priceEur = tradePrice
    } else if (quote === 'USD' || quote === 'USDT' || quote === 'USDC') {
      try {
        priceEur = await getPriceEur(base, dateStr)
      } catch {
        const usdPerEur = await getPriceEur('USD', dateStr).catch(() => 0)
        priceEur = usdPerEur > 0 ? tradePrice / usdPerEur : tradePrice
      }
    } else {
      try { priceEur = await getPriceEur(base, dateStr) }
      catch { priceEur = tradePrice }
    }

    if (!Number.isFinite(priceEur) || priceEur < 0) {
      skipped.push({ reason: 'invalid-price', detail: `${tradeId} ${base}/${quote} priceEur=${priceEur}` })
      continue
    }

    const amount = parseFloat(t.vol) || 0
    const rawFee = parseFloat(t.fee) || 0
    const feeEur = quote === 'EUR' ? rawFee : rawFee * (priceEur / (tradePrice || 1))
    const totalEur = amount * priceEur
    const type = t.type === 'buy' ? 'BUY' : 'SELL'

    results.push({
      id:        `kraken_${tradeId}`,
      source:    'kraken',
      type,
      crypto:    base,
      amount,
      price_eur: priceEur,
      total_eur: totalEur,
      fee_eur:   feeEur,
      date:      tradeDate,
      raw_pair:  t.pair,
    })
  }

  return { transactions: results, skipped }
}
