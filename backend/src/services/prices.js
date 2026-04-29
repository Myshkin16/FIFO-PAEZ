'use strict';

const https = require('https');
const db    = require('../db/db');

// ---------------------------------------------------------------------------
// CoinGecko coin ID mapping
// ---------------------------------------------------------------------------
const COIN_ID_MAP = {
  BTC:   'bitcoin',
  ETH:   'ethereum',
  SOL:   'solana',
  XRP:   'ripple',
  USDT:  'tether',
  BNB:   'binancecoin',
  ADA:   'cardano',
  DOT:   'polkadot',
  MATIC: 'matic-network',
  LINK:  'chainlink',
  FDUSD: 'first-digital-usd',
  SHIB:  'shiba-inu',
  // REI, CTK and others intentionally omitted — return 0 rather than guess.
};

// ---------------------------------------------------------------------------
// Pre-emptive throttling (CoinGecko free tier ≈ 10–30 calls/min)
// ---------------------------------------------------------------------------
let lastCallAt = 0;
const MIN_DELAY_MS = 1500;

async function throttle() {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < MIN_DELAY_MS) {
    await sleep(MIN_DELAY_MS - elapsed);
  }
  lastCallAt = Date.now();
}

// ---------------------------------------------------------------------------
// In-flight deduplication: collapse concurrent identical lookups
// ---------------------------------------------------------------------------
const inflight = new Map();

/**
 * Returns the EUR price for `crypto` on `dateStr` (YYYY-MM-DD).
 * Checks the SQLite price_cache first; falls back to CoinGecko API.
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

  // 1. Check cache
  const cached = db
    .prepare('SELECT price_eur FROM price_cache WHERE crypto = ? AND date = ?')
    .get(symbol, dateStr);

  if (cached) {
    console.log(`[prices] ${symbol} ${dateStr} -> cache hit (€${cached.price_eur})`);
    return cached.price_eur;
  }

  // 2. Deduplicate concurrent in-flight lookups
  const key = `${symbol}_${dateStr}`;
  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const promise = (async () => {
    console.log(`[prices] ${symbol} ${dateStr} -> fetching from CoinGecko...`);
    await throttle();
    const price = await fetchFromCoinGecko(symbol, dateStr);

    db.prepare('INSERT OR REPLACE INTO price_cache (crypto, date, price_eur) VALUES (?, ?, ?)')
      .run(symbol, dateStr, price);

    console.log(`[prices] ${symbol} ${dateStr} -> fetched €${price}`);
    return price;
  })().catch(err => {
    inflight.delete(key);
    throw err;
  }).then(value => {
    inflight.delete(key);
    return value;
  });

  inflight.set(key, promise);
  return promise;
}

/**
 * Fetches the EUR price from CoinGecko with up to 2 retries on 429
 * (10s, then 30s exponential backoff). Returns 0 for unknown coins
 * or coins CoinGecko returns no EUR price for. Throws on network/5xx errors.
 */
async function fetchFromCoinGecko(symbol, dateStr, attempt = 1) {
  // If we have no mapping, do not guess — gracefully return 0.
  if (!COIN_ID_MAP[symbol]) {
    console.warn(
      `[prices] No price found for ${symbol} on ${dateStr}, returning 0 EUR (manual review required)`
    );
    return 0;
  }

  const coinId    = COIN_ID_MAP[symbol];
  const geckoDate = toGeckoDate(dateStr); // DD-MM-YYYY

  const url =
    `https://api.coingecko.com/api/v3/coins/${coinId}/history` +
    `?date=${geckoDate}&localization=false`;

  let result;
  try {
    result = await httpsGetJson(url);
  } catch (err) {
    // Network or unrecoverable HTTP error — propagate so user sees it.
    throw new Error(
      `CoinGecko request failed for ${symbol} on ${dateStr}: ${err.message}`
    );
  }

  // 404 → coin/date unknown to CoinGecko: degrade gracefully.
  if (result && result.__status === 404) {
    console.warn(
      `[prices] No price found for ${symbol} on ${dateStr}, returning 0 EUR (manual review required)`
    );
    return 0;
  }

  // 429 → rate limited: retry with exponential backoff (10s, 30s).
  if (result && result.__status === 429) {
    const delays = [10_000, 30_000];
    if (attempt <= delays.length) {
      const delay = delays[attempt - 1];
      console.log(`[prices] 429 rate limit hit, waiting ${delay}ms before retry...`);
      await sleep(delay);
      return fetchFromCoinGecko(symbol, dateStr, attempt + 1);
    }
    throw new Error(
      `CoinGecko rate limit exceeded for ${symbol} on ${dateStr} after ${delays.length} retries.`
    );
  }

  const data  = result.body;
  const price = data?.market_data?.current_price?.eur;

  if (typeof price !== 'number' || isNaN(price)) {
    console.warn(
      `[prices] No price found for ${symbol} on ${dateStr}, returning 0 EUR (manual review required)`
    );
    return 0;
  }

  return price;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Converts 'YYYY-MM-DD' to 'DD-MM-YYYY' (CoinGecko's expected format).
 */
function toGeckoDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}-${m}-${y}`;
}

/**
 * Performs an HTTPS GET and returns `{ __status, body }`.
 * - On 200: `{ __status: 200, body: <parsed JSON> }`
 * - On 404 / 429: `{ __status, body: null }` (caller decides what to do)
 * - On other non-2xx, network error, timeout, or JSON parse error: rejects.
 *
 * Includes a 10s socket timeout so we never hang indefinitely.
 *
 * @param {string} url
 * @returns {Promise<{__status: number, body: any}>}
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
          if (res.statusCode === 429) {
            resolve({ __status: 429, body: null });
            return;
          }
          if (res.statusCode === 404) {
            resolve({ __status: 404, body: null });
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} from CoinGecko`));
            return;
          }
          try {
            resolve({ __status: 200, body: JSON.parse(raw) });
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}`));
          }
        });
      }
    );

    req.setTimeout(10_000, () => {
      req.destroy(new Error('CoinGecko request timed out after 10s'));
    });

    req.on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { getPriceEur };
