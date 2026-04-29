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
};

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

  if (cached) return cached.price_eur;

  // 2. Fetch from CoinGecko
  const price = await fetchFromCoinGecko(symbol, dateStr);

  // 3. Store in cache
  db.prepare('INSERT OR REPLACE INTO price_cache (crypto, date, price_eur) VALUES (?, ?, ?)')
    .run(symbol, dateStr, price);

  return price;
}

/**
 * Fetches the EUR price from CoinGecko with one 429-retry.
 */
async function fetchFromCoinGecko(symbol, dateStr, attempt = 1) {
  const coinId   = COIN_ID_MAP[symbol] || symbol.toLowerCase();
  const geckoDate = toGeckoDate(dateStr); // DD-MM-YYYY

  const url =
    `https://api.coingecko.com/api/v3/coins/${coinId}/history` +
    `?date=${geckoDate}&localization=false`;

  let data;
  try {
    data = await httpsGetJson(url);
  } catch (err) {
    throw new Error(
      `CoinGecko request failed for ${symbol} on ${dateStr}: ${err.message}`
    );
  }

  // Handle rate limiting
  if (data && data.status && data.status.error_code === 429) {
    if (attempt === 1) {
      await sleep(60_000);
      return fetchFromCoinGecko(symbol, dateStr, 2);
    }
    throw new Error(
      `CoinGecko rate limit exceeded for ${symbol} on ${dateStr} after retry.`
    );
  }

  const price = data?.market_data?.current_price?.eur;
  if (typeof price !== 'number' || isNaN(price)) {
    throw new Error(
      `CoinGecko returned no EUR price for ${symbol} on ${dateStr}. ` +
      `Coin ID tried: "${coinId}". Response: ${JSON.stringify(data).slice(0, 200)}`
    );
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
 * Performs an HTTPS GET and returns the parsed JSON body.
 * Uses the built-in `https` module so we stay CommonJS-compatible.
 *
 * @param {string} url
 * @returns {Promise<any>}
 */
function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'fifo-paez/1.0' } }, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        // CoinGecko sends 429 as a JSON body too
        if (res.statusCode === 429) {
          resolve({ status: { error_code: 429 } });
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} from CoinGecko`));
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { getPriceEur };
