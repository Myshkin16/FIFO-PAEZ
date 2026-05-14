'use strict';

const https = require('https');
const db    = require('../db/db');

// ---------------------------------------------------------------------------
// Price source: Binance public klines API
// ---------------------------------------------------------------------------
// Why Binance instead of CoinGecko? In late 2024 CoinGecko gated /coins/{id}/history
// behind their Demo plan (requires an API key); the free anonymous tier now
// returns HTTP 429/401 immediately, making large historical imports impossible.
// Binance's /api/v3/klines endpoint is public, key-free, and allows ~1200
// requests/minute — orders of magnitude more headroom than we need.
//
// Strategy per symbol:
//   1. Try {SYMBOL}EUR directly (BTCEUR, ETHEUR, ADAEUR, etc.)
//   2. If that pair doesn't exist on Binance, try {SYMBOL}USDT and multiply
//      by the USDT→EUR rate for the same date.
//   3. For USDT itself: invert the EURUSDT close price (1 USDT = 1/EURUSDT EUR)
//   4. For symbols with no Binance market: return 0 (caller logs).
//
// Stablecoins like USDC are valued at their actual market rate (USDCUSDT × USDT/EUR),
// not assumed-1.0, so depegs surface correctly in the FIFO output.

// ---------------------------------------------------------------------------
// Throttling
// ---------------------------------------------------------------------------
// Binance allows ~1200 req/min IP-wide. A 200ms gap (= 300/min) is generous
// and leaves plenty of room for the recursive USDT lookups some symbols need.
// Chain-based queue so concurrent imports share one ordered slot.
let tail = Promise.resolve();
const MIN_DELAY_MS = 200;

function throttle() {
  const prev = tail;
  tail = (async () => {
    await prev;
    await sleep(MIN_DELAY_MS);
  })();
  return prev;
}

// ---------------------------------------------------------------------------
// In-flight deduplication: collapse concurrent identical lookups
// ---------------------------------------------------------------------------
const inflight = new Map();

/**
 * Returns the EUR price for `crypto` on `dateStr` (YYYY-MM-DD).
 * Checks the SQLite price_cache first; falls back to Binance klines.
 *
 * @param {string} crypto   - Ticker symbol, e.g. 'BTC'
 * @param {string} dateStr  - 'YYYY-MM-DD'
 * @returns {Promise<number>}
 */
async function getPriceEur(crypto, dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Invalid dateStr format: "${dateStr}". Expected YYYY-MM-DD.`);
  }

  const symbol = crypto.toUpperCase();

  // EUR has a fixed self-price of 1.
  if (symbol === 'EUR') return 1;

  // 1. Check cache. Entries with source='failed' (and price 0) are treated as
  // cache misses so a subsequent import can retry — otherwise a transient
  // Binance/network blip during the first lookup would permanently zero-out
  // every trade that references this symbol/date. Legacy rows (source NULL)
  // pre-date the migration and are trusted as-is.
  const cached = db
    .prepare('SELECT price_eur, source FROM price_cache WHERE crypto = ? AND date = ?')
    .get(symbol, dateStr);

  if (cached && cached.source !== 'failed') {
    return cached.price_eur;
  }

  // 2. Deduplicate concurrent in-flight lookups
  const key = `${symbol}_${dateStr}`;
  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const promise = (async () => {
    let price = 0;
    let source = 'failed';
    try {
      const result = await fetchFromBinance(symbol, dateStr);
      price = result.price;
      source = result.source;
    } catch (err) {
      // Network / parse / unexpected error: cache 0 so we don't refetch this
      // symbol+date during the rest of the import.
      console.warn(
        `[prices] ${symbol} ${dateStr} fetch failed: ${err.message} — caching 0 EUR`
      );
      price = 0;
      source = 'failed';
    }

    db.prepare(
      `INSERT OR REPLACE INTO price_cache (crypto, date, price_eur, source, fetched_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(symbol, dateStr, price, source);

    console.log(`[prices] ${symbol} ${dateStr} -> €${price} (${source})`);
    return price;
  })().then(value => {
    inflight.delete(key);
    return value;
  }, err => {
    inflight.delete(key);
    throw err;
  });

  inflight.set(key, promise);
  return promise;
}

/**
 * Resolves the EUR price for `symbol` on `dateStr` using Binance daily klines.
 *
 * Returns `{price, source}` where source is one of:
 *   - 'binance-direct'        — direct {SYMBOL}EUR pair on Binance.
 *   - 'binance-usdt-derived'  — {SYMBOL}USDT × USDT/EUR, or 1/EURUSDT for USDT.
 *   - 'failed'                — no market and no derivable price (price = 0).
 */
async function fetchFromBinance(symbol, dateStr) {
  const startMs = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(startMs)) {
    throw new Error(`Cannot parse date '${dateStr}'`);
  }
  const endMs = startMs + 86_399_999;

  // 1. Direct EUR pair (BTCEUR, ETHEUR, ADAEUR, ...)
  const direct = await fetchKlineClose(`${symbol}EUR`, startMs, endMs);
  if (direct !== null) return { price: direct, source: 'binance-direct' };

  // 2. USDT itself: invert the EUR/USDT rate.
  if (symbol === 'USDT') {
    const eurUsdt = await fetchKlineClose('EURUSDT', startMs, endMs);
    if (eurUsdt && eurUsdt > 0) {
      return { price: 1 / eurUsdt, source: 'binance-usdt-derived' };
    }
    console.warn(`[prices] No EURUSDT kline for ${dateStr}, returning 0 EUR`);
    return { price: 0, source: 'failed' };
  }

  // 3. {SYMBOL}USDT × (USDT in EUR). USDT lookup uses getPriceEur so it's cached
  // and serialized through the same throttle/inflight machinery as everything else.
  const symbolUsdt = await fetchKlineClose(`${symbol}USDT`, startMs, endMs);
  if (symbolUsdt !== null) {
    const usdtEur = await getPriceEur('USDT', dateStr);
    if (usdtEur > 0) {
      return { price: symbolUsdt * usdtEur, source: 'binance-usdt-derived' };
    }
  }

  console.warn(
    `[prices] No Binance market found for ${symbol} on ${dateStr}, returning 0 EUR (manual review required)`
  );
  return { price: 0, source: 'failed' };
}

/**
 * Fetches one daily kline from Binance and returns its close price.
 * Returns null when the symbol pair is invalid (HTTP 400 -1121) or the
 * kline array is empty (no data for that date).
 */
async function fetchKlineClose(pair, startMs, endMs) {
  await throttle();

  const url =
    `https://api.binance.com/api/v3/klines` +
    `?symbol=${pair}&interval=1d&startTime=${startMs}&endTime=${endMs}&limit=1`;

  const result = await httpsGetJson(url);

  // 400 + -1121 means "Invalid symbol" — the pair doesn't exist on Binance.
  if (result.__status === 400) {
    return null;
  }
  // 418/429 → IP-banned or rate-limited. Surface as error so caller can decide.
  if (result.__status !== 200) {
    throw new Error(`HTTP ${result.__status} from Binance for ${pair}`);
  }

  const body = result.body;
  if (!Array.isArray(body) || body.length === 0) return null;

  // Kline shape: [openTime, open, high, low, close, volume, ...]
  const close = parseFloat(body[0][4]);
  if (!Number.isFinite(close) || close <= 0) return null;
  return close;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Performs an HTTPS GET and returns `{ __status, body }`.
 * - On 2xx: `{ __status, body: <parsed JSON> }`
 * - On 4xx: `{ __status, body: <parsed JSON or null> }` (caller decides)
 * - On 5xx, network error, timeout, or JSON parse error: rejects.
 */
function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'fifo-paez/1.0' } },
      (res) => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          const status = res.statusCode;
          if (status >= 500) {
            reject(new Error(`HTTP ${status}`));
            return;
          }
          let body = null;
          if (raw.length > 0) {
            try {
              body = JSON.parse(raw);
            } catch (e) {
              if (status >= 200 && status < 300) {
                reject(new Error(`JSON parse error: ${e.message}`));
                return;
              }
              // Non-JSON 4xx body: ignore, caller only needs status.
            }
          }
          resolve({ __status: status, body });
        });
      }
    );

    req.setTimeout(10_000, () => {
      req.destroy(new Error('Request timed out after 10s'));
    });

    req.on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Pre-fetches a deduplicated batch of (symbol, dateStr) prices into the cache.
 * Skips entries already present. Logs progress so the user can see the import
 * is making forward progress instead of appearing stuck.
 *
 * @param {Array<{symbol: string, dateStr: string}>} items
 * @returns {Promise<{total: number, alreadyCached: number, fetched: number}>}
 */
async function warmPriceCache(items) {
  const unique = new Map();
  for (const it of items) {
    if (!it || !it.symbol || !it.dateStr) continue;
    const symbol  = it.symbol.toUpperCase();
    const dateStr = it.dateStr;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
    if (symbol === 'EUR') continue;
    unique.set(`${symbol}_${dateStr}`, { symbol, dateStr });
  }

  const stmtCheck = db.prepare('SELECT 1 FROM price_cache WHERE crypto = ? AND date = ?');
  const needed = [];
  for (const it of unique.values()) {
    if (!stmtCheck.get(it.symbol, it.dateStr)) needed.push(it);
  }

  const total = unique.size;
  const alreadyCached = total - needed.length;
  console.log(
    `[prices] Warming cache: ${needed.length} to fetch (${alreadyCached} already cached, ${total} total unique)`
  );

  let done = 0;
  for (const { symbol, dateStr } of needed) {
    done++;
    if (done % 10 === 0 || done === needed.length) {
      console.log(`[prices] [${done}/${needed.length}] (latest: ${symbol} ${dateStr})`);
    }
    await getPriceEur(symbol, dateStr);
  }

  return { total, alreadyCached, fetched: needed.length };
}

module.exports = { getPriceEur, warmPriceCache };
