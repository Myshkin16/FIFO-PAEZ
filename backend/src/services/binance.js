'use strict';

const { parse } = require('csv-parse/sync');
const { getPriceEur } = require('./prices');

/**
 * Parses a Binance Trade History CSV buffer and returns an array of
 * normalised transaction objects.
 *
 * Expected CSV columns (Binance Trade History export):
 *   Date(UTC), Pair, Side, Price, Executed, Amount, Fee
 *
 * Example row:
 *   2024-03-12 10:30:00,BTCEUR,BUY,65000,0.15 BTC,9750 EUR,9.75 EUR
 *
 * @param {Buffer|string} csvBuffer
 * @returns {Promise<object[]>}
 */
async function parseBinanceCsv(csvBuffer) {
  let rows;
  try {
    rows = parse(csvBuffer, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    throw new Error(`Failed to parse Binance CSV: ${err.message}. Make sure you exported "Trade History" from Binance.`);
  }

  const results = [];

  for (const row of rows) {
    // Column names may have extra whitespace; normalise keys
    const r = normaliseKeys(row);

    const dateUtc  = r['date(utc)'] || r['date'];
    const pair     = r['pair']      || '';
    const side     = (r['side']     || '').toUpperCase();
    const executed = r['executed']  || '';   // e.g. "0.15 BTC"
    const amountRaw = r['amount']   || '';   // e.g. "9750 EUR"
    const feeRaw   = r['fee']       || '';   // e.g. "9.75 EUR"
    const priceRaw = r['price']     || '';   // e.g. "65000"

    if (!dateUtc || !pair || !side) continue;

    // Determine base and quote currencies from pair
    const { base, quote } = splitPair(pair);

    // Parse numeric values and their currency suffixes
    const { value: executedAmount } = parseValueWithCurrency(executed);
    const { value: amountValue, currency: amountCurrency } = parseValueWithCurrency(amountRaw);
    const { value: feeValue,    currency: feeCurrency }    = parseValueWithCurrency(feeRaw);
    const priceValue = parseFloat(priceRaw) || 0;

    // Date to YYYY-MM-DD (dateUtc is 'YYYY-MM-DD HH:MM:SS')
    const dateStr  = dateUtc.slice(0, 10);
    const isoDate  = new Date(dateUtc + 'Z').toISOString();

    // Determine EUR price for the base asset
    let priceEur;
    if (quote === 'EUR') {
      priceEur = priceValue;
    } else {
      // Quote is something like USDT, BTC, BNB — look up EUR price for base asset
      try {
        priceEur = await getPriceEur(base, dateStr);
      } catch {
        priceEur = priceValue; // fallback, may be inaccurate
      }
    }

    // Convert fee to EUR
    let feeEur = 0;
    if (feeCurrency === 'EUR') {
      feeEur = feeValue;
    } else if (feeCurrency === base) {
      feeEur = feeValue * priceEur;
    } else if (feeCurrency) {
      // Fee in some other asset (e.g. BNB) — try to look up EUR price
      try {
        const feePriceEur = await getPriceEur(feeCurrency, dateStr);
        feeEur = feeValue * feePriceEur;
      } catch {
        feeEur = feeValue * priceEur; // rough fallback
      }
    }

    const amount = executedAmount;
    // If the quote currency is EUR, the Amount column is the exact executed total;
    // otherwise approximate from the EUR price lookup.
    let totalEur;
    if (quote === 'EUR') {
      totalEur = amountValue; // exact trade total from exchange
    } else {
      totalEur = amount * priceEur; // approximation for non-EUR pairs
    }
    const type = side === 'BUY' ? 'BUY' : 'SELL';

    // Build a unique ID (append row index to handle duplicate date/pair/side)
    const id = `binance_${dateUtc}_${pair}_${side}_${results.length}`.replace(/\s+/g, '_');

    results.push({
      id,
      source:    'binance',
      type,
      crypto:    base,
      amount,
      price_eur: priceEur,
      total_eur: totalEur,
      fee_eur:   feeEur,
      date:      isoDate,
      raw_pair:  pair,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Lowercases all keys in an object and trims them.
 */
function normaliseKeys(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k.trim().toLowerCase()] = v;
  }
  return out;
}

/**
 * Splits a Binance trading pair into base and quote.
 * Tries known quote currencies first (longest match wins for USDT vs USD).
 *
 * @param {string} pair  e.g. 'BTCEUR', 'ETHUSDT', 'BNBBTC'
 * @returns {{ base: string, quote: string }}
 */
const KNOWN_QUOTES = ['USDT', 'USDC', 'BUSD', 'TUSD', 'EUR', 'USD', 'GBP', 'BTC', 'ETH', 'BNB'];

function splitPair(pair) {
  const upper = pair.toUpperCase();
  for (const q of KNOWN_QUOTES) {
    if (upper.endsWith(q)) {
      return { base: upper.slice(0, upper.length - q.length), quote: q };
    }
  }
  // Fallback: 3+rest
  return { base: upper.slice(0, 3), quote: upper.slice(3) };
}

/**
 * Parses strings like "0.15 BTC" or "9750 EUR" into { value, currency }.
 */
function parseValueWithCurrency(str) {
  const trimmed = (str || '').trim();
  const match   = trimmed.match(/^([\d.]+)\s*([A-Za-z]*)$/);
  if (!match) return { value: 0, currency: '' };
  return {
    value:    parseFloat(match[1]) || 0,
    currency: match[2].toUpperCase(),
  };
}

module.exports = { parseBinanceCsv };
