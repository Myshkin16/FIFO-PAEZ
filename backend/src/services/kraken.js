'use strict';

const crypto = require('crypto');
const https  = require('https');
const qs     = require('querystring');

const { getPriceEur } = require('./prices');

const KRAKEN_BASE = 'https://api.kraken.com';

// ---------------------------------------------------------------------------
// Kraken pair → base crypto normalisation
// ---------------------------------------------------------------------------

/**
 * Strips Kraken's X/Z prefix codes and maps to a clean ticker.
 * e.g. 'XXBTZEUR' → { base: 'BTC', quote: 'EUR' }
 *      'XETHXBT'  → { base: 'ETH', quote: 'BTC' }
 */
const KRAKEN_PREFIX_MAP = {
  XXBT:  'BTC',
  XETH:  'ETH',
  XLTC:  'LTC',
  XXLM:  'XLM',
  XXRP:  'XRP',
  XZEC:  'ZEC',
  XDASH: 'DASH',
  ZUSD:  'USD',
  ZEUR:  'EUR',
  ZGBP:  'GBP',
  ZCAD:  'CAD',
  ZJPY:  'JPY',
};

function normalisePairComponent(token) {
  return KRAKEN_PREFIX_MAP[token] || token;
}

/**
 * Given a Kraken pair string, returns { base, quote }.
 * Handles 4-char split (most pairs), 8-char split (XXBTZEUR), etc.
 */
function extractBaseQuote(pair) {
  // Common 4+4 format: XXBTZEUR
  if (pair.length === 8) {
    const b = normalisePairComponent(pair.slice(0, 4));
    const q = normalisePairComponent(pair.slice(4));
    return { base: b, quote: q };
  }
  // 3+3 format: BTCEUR, ETHUSD…
  if (pair.length === 6) {
    return { base: pair.slice(0, 3), quote: pair.slice(3) };
  }
  // Fallback: try 4-char prefix → rest
  const prefix4 = pair.slice(0, 4);
  if (KRAKEN_PREFIX_MAP[prefix4]) {
    return {
      base:  KRAKEN_PREFIX_MAP[prefix4],
      quote: normalisePairComponent(pair.slice(4)),
    };
  }
  // Last resort: 3-char split
  return { base: pair.slice(0, 3), quote: pair.slice(3) };
}

// ---------------------------------------------------------------------------
// Kraken API authentication
// ---------------------------------------------------------------------------

/**
 * Builds the Kraken API-Sign header value.
 *
 * @param {string} path         - e.g. '/0/private/TradesHistory'
 * @param {string} postBody     - URL-encoded POST body (includes nonce)
 * @param {string} nonce        - Same nonce included in postBody
 * @param {string} privateKey   - Base64-encoded Kraken private key
 * @returns {string} Base64 HMAC-SHA512 signature
 */
function krakenSign(path, postBody, nonce, privateKey) {
  const message = nonce + postBody;
  const sha256Hash = crypto
    .createHash('sha256')
    .update(message, 'utf8')
    .digest();

  const pathBuffer    = Buffer.from(path, 'utf8');
  const hmacInput     = Buffer.concat([pathBuffer, sha256Hash]);
  const decodedSecret = Buffer.from(privateKey, 'base64');

  return crypto
    .createHmac('sha512', decodedSecret)
    .update(hmacInput)
    .digest('base64');
}

/**
 * Makes an authenticated POST to a Kraken private endpoint.
 *
 * @param {string} path
 * @param {object} params   - Additional POST parameters (excluding nonce)
 * @param {string} apiKey
 * @param {string} privateKey
 * @returns {Promise<any>}  - Parsed JSON result field
 */
async function krakenPost(path, params, apiKey, privateKey) {
  const nonce    = String(Date.now() * 1000);
  const body     = qs.stringify({ nonce, ...params });
  const apiSign  = krakenSign(path, body, nonce, privateKey);

  const data = await httpsPostJson(`${KRAKEN_BASE}${path}`, body, {
    'API-Key':      apiKey,
    'API-Sign':     apiSign,
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent':   'fifo-paez/1.0',
  });

  if (data.error && data.error.length > 0) {
    throw new Error(`Kraken API error on ${path}: ${data.error.join(', ')}`);
  }

  return data.result;
}

// ---------------------------------------------------------------------------
// Fetch all trades (paginated)
// ---------------------------------------------------------------------------

/**
 * Fetches the complete trade history from Kraken.
 *
 * @param {string} apiKey
 * @param {string} privateKey
 * @returns {Promise<object>}  Map of tradeId → trade object
 */
async function fetchAllTrades(apiKey, privateKey) {
  const allTrades = {};
  let offset = 0;
  const PAGE = 50;

  while (true) {
    const result = await krakenPost(
      '/0/private/TradesHistory',
      { ofs: offset },
      apiKey,
      privateKey
    );

    const trades = result.trades || {};
    const count  = result.count  || 0;

    Object.assign(allTrades, trades);
    offset += PAGE;

    if (offset >= count || Object.keys(trades).length === 0) break;
  }

  return allTrades;
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

/**
 * Fetches and normalises all Kraken trade history.
 *
 * @param {string} apiKey
 * @param {string} privateKey
 * @returns {Promise<object[]>}  Array of normalised transaction objects
 */
async function fetchKrakenHistory(apiKey, privateKey) {
  const rawTrades = await fetchAllTrades(apiKey, privateKey);
  const results   = [];

  for (const [tradeId, t] of Object.entries(rawTrades)) {
    const { base, quote } = extractBaseQuote(t.pair || '');

    let priceEur;
    const tradePrice = parseFloat(t.price) || 0;
    const tradeDate  = new Date(t.time * 1000).toISOString();
    const dateStr    = tradeDate.slice(0, 10); // YYYY-MM-DD

    if (quote === 'EUR') {
      priceEur = tradePrice;
    } else if (quote === 'USD' || quote === 'USDT' || quote === 'USDC') {
      // Convert: get EUR price of the base asset for that date
      try {
        priceEur = await getPriceEur(base, dateStr);
      } catch {
        // Fallback: convert USD → EUR with spot EUR/USD price
        const usdPerEur = await getPriceEur('USD', dateStr).catch(() => null);
        if (usdPerEur) {
          priceEur = tradePrice / usdPerEur;
        } else {
          priceEur = tradePrice; // last resort, may be inaccurate
        }
      }
    } else {
      // Non-EUR, non-USD pair → look up EUR price for the date
      try {
        priceEur = await getPriceEur(base, dateStr);
      } catch {
        priceEur = tradePrice;
      }
    }

    const amount  = parseFloat(t.vol) || 0;
    const rawFee  = parseFloat(t.fee) || 0;
    // Kraken returns fees in the quote currency. Convert to EUR for non-EUR pairs.
    const feeEur  = quote === 'EUR'
      ? rawFee
      : rawFee * (priceEur / (tradePrice || 1));
    const totalEur = amount * priceEur;

    const type = t.type === 'buy' ? 'BUY' : 'SELL';

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
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// HTTPS helper
// ---------------------------------------------------------------------------

function httpsPostJson(url, body, headers) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      method:   'POST',
      headers:  {
        ...headers,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode} from Kraken`));
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { fetchKrakenHistory };
