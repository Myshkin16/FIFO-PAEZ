'use strict';

const { parse } = require('csv-parse/sync');
const { getPriceEur } = require('./prices');

// Stablecoins treated as fiat-equivalent quote currencies for price lookups
const USD_STABLES = new Set(['USDT', 'USDC', 'BUSD', 'TUSD', 'FDUSD', 'DAI']);

/**
 * Parses a Binance CSV buffer and returns an array of normalised transaction
 * objects. Auto-detects between two formats:
 *
 *   1. "Trade History" (English columns):
 *        Date(UTC), Pair, Side, Price, Executed, Amount, Fee
 *
 *   2. "Transaction History" (Spanish columns, with BOM):
 *        ID de usuario, Tiempo, Cuenta, Operación, Moneda, Cambio, Observación
 *
 * @param {Buffer|string} csvBuffer
 * @returns {Promise<object[]>}
 */
async function parseBinanceCsv(csvBuffer) {
  // Strip BOM if present, then sniff the header row
  const text = (Buffer.isBuffer(csvBuffer) ? csvBuffer.toString('utf8') : String(csvBuffer))
    .replace(/^﻿/, '');

  const firstLine = (text.split(/\r?\n/)[0] || '').toLowerCase();

  if (
    firstLine.includes('id de usuario') ||
    firstLine.includes('operación') ||
    firstLine.includes('operacion')
  ) {
    return await parseTransactionHistory(text);
  }
  return await parseTradeHistory(text);
}

// ---------------------------------------------------------------------------
// Format 1: Trade History (English) — original behaviour
// ---------------------------------------------------------------------------

async function parseTradeHistory(text) {
  let rows;
  try {
    rows = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    throw new Error(
      `Failed to parse Binance CSV: ${err.message}. ` +
      `Make sure you exported "Trade History" or "Transaction History" from Binance.`
    );
  }

  const results = [];

  for (const row of rows) {
    const r = normaliseKeys(row);

    const dateUtc   = r['date(utc)'] || r['date'];
    const pair      = r['pair']      || '';
    const side      = (r['side']     || '').toUpperCase();
    const executed  = r['executed']  || '';   // e.g. "0.15 BTC"
    const amountRaw = r['amount']    || '';   // e.g. "9750 EUR"
    const feeRaw    = r['fee']       || '';   // e.g. "9.75 EUR"
    const priceRaw  = r['price']     || '';   // e.g. "65000"

    if (!dateUtc || !pair || !side) continue;

    const { base, quote } = splitPair(pair);

    const { value: executedAmount } = parseValueWithCurrency(executed);
    const { value: amountValue }     = parseValueWithCurrency(amountRaw);
    const { value: feeValue, currency: feeCurrency } = parseValueWithCurrency(feeRaw);
    const priceValue = parseFloat(priceRaw) || 0;

    const dateStr = dateUtc.slice(0, 10);
    const isoDate = new Date(dateUtc + 'Z').toISOString();

    let priceEur;
    if (quote === 'EUR') {
      priceEur = priceValue;
    } else {
      try {
        priceEur = await getPriceEur(base, dateStr);
      } catch {
        priceEur = priceValue;
      }
    }

    let feeEur = 0;
    if (feeCurrency === 'EUR') {
      feeEur = feeValue;
    } else if (feeCurrency === base) {
      feeEur = feeValue * priceEur;
    } else if (feeCurrency) {
      try {
        const feePriceEur = await getPriceEur(feeCurrency, dateStr);
        feeEur = feeValue * feePriceEur;
      } catch {
        feeEur = feeValue * priceEur;
      }
    }

    const amount = executedAmount;
    let totalEur;
    if (quote === 'EUR') {
      totalEur = amountValue;
    } else {
      totalEur = amount * priceEur;
    }
    const type = side === 'BUY' ? 'BUY' : 'SELL';

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
// Format 2: Transaction History (Spanish)
// ---------------------------------------------------------------------------

const IGNORED_OPS = new Set([
  'Transfer Between Spot Account and UM Futures Account',
  'Deposit',
  'Withdraw',
]);

async function parseTransactionHistory(text) {
  let rows;
  try {
    rows = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    throw new Error(
      `Failed to parse Binance CSV: ${err.message}. ` +
      `Make sure you exported "Transaction History" or "Trade History" from Binance.`
    );
  }

  // Normalise rows
  const norm = [];
  for (const row of rows) {
    const r = normaliseKeys(row);
    const tiempo  = r['tiempo'] || '';
    const cuenta  = r['cuenta'] || '';
    const operacion = r['operación'] || r['operacion'] || '';
    const moneda  = (r['moneda'] || '').toUpperCase();
    const cambio  = parseFloat(r['cambio']) || 0;
    const obs     = r['observación'] || r['observacion'] || '';

    if (!tiempo || !operacion) continue;
    if (cuenta !== 'Spot') continue;            // skip futures rows
    if (IGNORED_OPS.has(operacion)) continue;   // skip transfers / deposits / withdrawals

    norm.push({ tiempo, operacion, moneda, cambio, obs });
  }

  // Group by timestamp
  const byTime = new Map();
  for (const r of norm) {
    if (!byTime.has(r.tiempo)) byTime.set(r.tiempo, []);
    byTime.get(r.tiempo).push(r);
  }

  // Sort timestamps chronologically (string sort works for YY-MM-DD HH:MM:SS)
  const timestamps = Array.from(byTime.keys()).sort();

  // Track Convert rows we still need to pair. Convert rows can be split across
  // adjacent seconds (the negative + positive may be 1 second apart).
  const pendingConvert = []; // [{ tiempo, sign, moneda, cambio }]

  const results = [];

  for (const tiempo of timestamps) {
    const group = byTime.get(tiempo);

    // --- Bucket rows in this group by operation ---
    const buys     = group.filter(r => r.operacion === 'Transaction Buy');
    const spends   = group.filter(r => r.operacion === 'Transaction Spend');
    const sold     = group.filter(r => r.operacion === 'Transaction Sold');
    const revenue  = group.filter(r => r.operacion === 'Transaction Revenue');
    const fees     = group.filter(r => r.operacion === 'Transaction Fee');
    const convert  = group.filter(r => r.operacion === 'Binance Convert');
    const dust     = group.filter(r => r.operacion === 'Small Assets Exchange BNB');

    // --- 1. BUY trades ---
    if (buys.length > 0) {
      const buyTxs = await pairTradeRows({
        type:        'BUY',
        baseRows:    buys,         // positive cambio rows
        counterRows: spends,       // negative cambio rows
        feeRows:     fees,
        tiempo,
        startIdSuffix: results.length,
      });
      results.push(...buyTxs);
    }

    // --- 2. SELL trades ---
    if (sold.length > 0) {
      const sellTxs = await pairTradeRows({
        type:        'SELL',
        baseRows:    sold,         // negative cambio rows
        counterRows: revenue,      // positive cambio rows
        feeRows:     fees,
        tiempo,
        startIdSuffix: results.length,
      });
      results.push(...sellTxs);
    }

    // --- 3. Binance Convert: queue rows for cross-second pairing ---
    for (const c of convert) {
      pendingConvert.push({
        tiempo,
        moneda: c.moneda,
        cambio: c.cambio,
      });
    }

    // --- 4. Small Assets Exchange BNB (dust) ---
    if (dust.length > 0) {
      // Pair by Observación: each "X to BNB" obs has one negative X row and
      // one positive BNB row.
      const byObs = new Map();
      for (const d of dust) {
        const key = d.obs || `${d.moneda}_${d.cambio < 0 ? 'neg' : 'pos'}`;
        if (!byObs.has(key)) byObs.set(key, []);
        byObs.get(key).push(d);
      }
      for (const [, pair] of byObs) {
        const negRow = pair.find(p => p.cambio < 0);
        const posRow = pair.find(p => p.cambio > 0 && p.moneda === 'BNB');
        if (!negRow) continue;

        const base = negRow.moneda;
        const baseAmount = -negRow.cambio;
        const bnbAmount = posRow ? posRow.cambio : 0;

        const tx = await buildTrade({
          type:        'SELL',
          base,
          baseAmount,
          quoteMoneda: 'BNB',
          quoteAmount: bnbAmount,
          baseFeeAmount: 0,
          otherFeeContribs: [],
          tiempo,
          idSuffix: results.length,
          rawPair: 'DUST',
        });
        results.push(tx);
      }
    }
  }

  // --- Pair up Convert rows ---
  // Sort pending by tiempo so adjacent (1-second-apart) rows pair correctly
  pendingConvert.sort((a, b) => a.tiempo.localeCompare(b.tiempo));
  while (pendingConvert.length > 0) {
    const first = pendingConvert.shift();
    // Find the closest unmatched row with opposite sign
    let mateIdx = -1;
    for (let i = 0; i < pendingConvert.length; i++) {
      const cand = pendingConvert[i];
      if (Math.sign(cand.cambio) !== Math.sign(first.cambio)) {
        // Within a few seconds tolerance
        const tdiff = Math.abs(
          tiempoToUnix(cand.tiempo) - tiempoToUnix(first.tiempo)
        );
        if (tdiff <= 5) {
          mateIdx = i;
          break;
        }
      }
    }
    if (mateIdx === -1) continue; // unmatched, skip
    const mate = pendingConvert.splice(mateIdx, 1)[0];

    const negRow = first.cambio < 0 ? first : mate;
    const posRow = first.cambio > 0 ? first : mate;

    // Use the earliest tiempo for the timestamp
    const tiempo = first.tiempo <= mate.tiempo ? first.tiempo : mate.tiempo;

    // Emit a SELL of the negative side and a BUY of the positive side
    const sellTx = await buildTrade({
      type:        'SELL',
      base:        negRow.moneda,
      baseAmount:  -negRow.cambio,
      quoteMoneda: posRow.moneda,
      quoteAmount: posRow.cambio,
      baseFeeAmount: 0,
      otherFeeContribs: [],
      tiempo,
      idSuffix: results.length,
      rawPair: 'CONVERT',
    });
    results.push(sellTx);

    const buyTx = await buildTrade({
      type:        'BUY',
      base:        posRow.moneda,
      baseAmount:  posRow.cambio,
      quoteMoneda: negRow.moneda,
      quoteAmount: -negRow.cambio,
      baseFeeAmount: 0,
      otherFeeContribs: [],
      tiempo,
      idSuffix: results.length,
      rawPair: 'CONVERT',
    });
    results.push(buyTx);
  }

  return results;
}

/**
 * Pairs Buy/Spend (or Sold/Revenue) rows within a single timestamp group and
 * emits one normalised trade per distinct base crypto.
 *
 * Strategy:
 *   - If all base rows are the same crypto: aggregate everything into one trade.
 *   - Otherwise: pair base rows with counter rows by index (Binance writes them
 *     interleaved in trade order, so Buy[i] corresponds to Spend[i]).
 *
 * @param {object} args
 * @param {'BUY'|'SELL'} args.type
 * @param {Array} args.baseRows      Buy rows (positive) for BUY, Sold (negative) for SELL
 * @param {Array} args.counterRows   Spend (negative) for BUY, Revenue (positive) for SELL
 * @param {Array} args.feeRows       Transaction Fee rows in this timestamp
 * @param {string} args.tiempo
 * @param {number} args.startIdSuffix
 * @returns {Promise<object[]>}
 */
async function pairTradeRows(args) {
  const { type, baseRows, counterRows, feeRows, tiempo, startIdSuffix } = args;
  const baseSet = new Set(baseRows.map(r => r.moneda));

  const out = [];

  if (baseSet.size === 1) {
    // ---- Single base: aggregate ----
    const base = baseRows[0].moneda;
    const baseAmount = baseRows.reduce((s, r) => s + Math.abs(r.cambio), 0);

    const quoteMoneda = counterRows[0]?.moneda || '';
    const quoteAmount = counterRows.reduce((s, r) => s + Math.abs(r.cambio), 0);

    // Base-asset fees are absorbed into this trade
    const baseFeeAmount = feeRows
      .filter(f => f.moneda === base)
      .reduce((s, f) => s + Math.abs(f.cambio), 0);

    // Other fees (BNB, USDT, USDC, etc.)
    const otherFeeContribs = feeRows
      .filter(f => f.moneda !== base)
      .map(f => ({ moneda: f.moneda, amount: Math.abs(f.cambio) }));

    out.push(await buildTrade({
      type,
      base,
      baseAmount,
      quoteMoneda,
      quoteAmount,
      baseFeeAmount,
      otherFeeContribs,
      tiempo,
      idSuffix: startIdSuffix + out.length,
    }));
    return out;
  }

  // ---- Multi-base: pair Buy[i] with Spend[i] sequentially ----
  // Group base rows by crypto, preserving CSV order. Pair each base row with
  // the corresponding counter row at the same position.
  const n = Math.min(baseRows.length, counterRows.length);

  // Per-base aggregation across the i-th pairs
  const perBase = new Map(); // base -> { baseAmount, quoteMoneda, quoteAmount }
  for (let i = 0; i < n; i++) {
    const br = baseRows[i];
    const cr = counterRows[i];
    const base = br.moneda;
    const acc = perBase.get(base) || {
      baseAmount: 0, quoteMoneda: cr.moneda, quoteAmount: 0,
    };
    acc.baseAmount  += Math.abs(br.cambio);
    acc.quoteAmount += Math.abs(cr.cambio);
    perBase.set(base, acc);
  }

  // Distribute fees: base-asset fees → that base; other fees → split by share
  // of total counter amount (a reasonable heuristic for shared fees like BNB).
  const totalCounter = Array.from(perBase.values()).reduce((s, v) => s + v.quoteAmount, 0) || 1;

  for (const [base, acc] of perBase) {
    const baseFeeAmount = feeRows
      .filter(f => f.moneda === base)
      .reduce((s, f) => s + Math.abs(f.cambio), 0);

    const share = acc.quoteAmount / totalCounter;
    const otherFeeContribs = feeRows
      .filter(f => !baseSet.has(f.moneda))
      .map(f => ({ moneda: f.moneda, amount: Math.abs(f.cambio) * share }));

    out.push(await buildTrade({
      type,
      base,
      baseAmount:  acc.baseAmount,
      quoteMoneda: acc.quoteMoneda,
      quoteAmount: acc.quoteAmount,
      baseFeeAmount,
      otherFeeContribs,
      tiempo,
      idSuffix: startIdSuffix + out.length,
    }));
  }

  return out;
}

/**
 * Builds a normalised trade object using EUR price logic.
 *
 * @param {object} args
 * @param {'BUY'|'SELL'} args.type
 * @param {string} args.base            Base crypto symbol (the asset acquired/disposed)
 * @param {number} args.baseAmount      Positive number
 * @param {string} args.quoteMoneda     Counter-side currency
 * @param {number} args.quoteAmount     Positive number (already sign-adjusted)
 * @param {number} args.baseFeeAmount   Fee in base asset (positive number)
 * @param {Array<{moneda:string,amount:number}>} args.otherFeeContribs  Fee in other assets
 * @param {string} args.tiempo          'YY-MM-DD HH:MM:SS'
 * @param {number} args.idSuffix
 * @param {string} [args.rawPair]       Override (e.g. 'CONVERT', 'DUST')
 */
async function buildTrade(args) {
  const {
    type, base, baseAmount, quoteMoneda, quoteAmount,
    baseFeeAmount, otherFeeContribs, tiempo, idSuffix,
  } = args;

  const dateStr = `20${tiempo.slice(0, 8)}`;             // 'YYYY-MM-DD'
  const isoDate = tiempoToIso(tiempo);

  // ---- Determine price_eur and total_eur ----
  let priceEur;
  let totalEur;

  if (base === 'EUR') {
    // EUR-as-base (e.g. user sold EUR for USDT to enter crypto). Treat as
    // 1:1 EUR pricing — total_eur is just the EUR amount.
    priceEur = 1;
    totalEur = baseAmount;
  } else if (quoteMoneda === 'EUR') {
    totalEur  = quoteAmount;
    priceEur  = baseAmount > 0 ? totalEur / baseAmount : 0;
  } else if (USD_STABLES.has(quoteMoneda)) {
    // Lookup EUR price for the BASE asset
    priceEur = await safePriceEur(base, dateStr);
    totalEur = baseAmount * priceEur;
  } else {
    // Crypto-to-crypto — lookup EUR price for the base asset
    priceEur = await safePriceEur(base, dateStr);
    totalEur = baseAmount * priceEur;
  }

  // ---- Fee in EUR ----
  let feeEur = 0;
  if (baseFeeAmount > 0) {
    feeEur += baseFeeAmount * priceEur;
  }
  for (const f of otherFeeContribs) {
    if (!f.amount) continue;
    if (f.moneda === 'EUR') {
      feeEur += f.amount;
    } else if (USD_STABLES.has(f.moneda)) {
      // Approximate stablecoin ≈ 1 USD; convert via EUR price of the base
      // proportionally — easiest: look up the stablecoin via prices.js
      const p = await safePriceEur(f.moneda, dateStr);
      feeEur += f.amount * p;
    } else {
      const p = await safePriceEur(f.moneda, dateStr);
      feeEur += f.amount * p;
    }
  }

  const rawPair = args.rawPair || `${base}/${quoteMoneda || '?'}`;
  const id = `binance_${tiempoToUnix(tiempo)}_${type}_${base}_${quoteMoneda || 'X'}_${idSuffix}`;

  return {
    id,
    source:    'binance',
    type,
    crypto:    base,
    amount:    baseAmount,
    price_eur: priceEur,
    total_eur: totalEur,
    fee_eur:   feeEur,
    date:      isoDate,
    raw_pair:  rawPair,
  };
}

async function safePriceEur(symbol, dateStr) {
  try {
    return await getPriceEur(symbol, dateStr);
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normaliseKeys(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k.trim().toLowerCase()] = v;
  }
  return out;
}

const KNOWN_QUOTES = ['USDT', 'USDC', 'BUSD', 'TUSD', 'EUR', 'USD', 'GBP', 'BTC', 'ETH', 'BNB'];

function splitPair(pair) {
  const upper = pair.toUpperCase();
  for (const q of KNOWN_QUOTES) {
    if (upper.endsWith(q)) {
      return { base: upper.slice(0, upper.length - q.length), quote: q };
    }
  }
  return { base: upper.slice(0, 3), quote: upper.slice(3) };
}

function parseValueWithCurrency(str) {
  const trimmed = (str || '').trim();
  const match   = trimmed.match(/^([\d.]+)\s*([A-Za-z]*)$/);
  if (!match) return { value: 0, currency: '' };
  return {
    value:    parseFloat(match[1]) || 0,
    currency: match[2].toUpperCase(),
  };
}

/**
 * Convert 'YY-MM-DD HH:MM:SS' to ISO 8601 UTC string.
 * The two-digit year is treated as 20YY.
 */
function tiempoToIso(tiempo) {
  const yyyy = '20' + tiempo.slice(0, 2);
  const rest = tiempo.slice(2); // '-MM-DD HH:MM:SS'
  return new Date(`${yyyy}${rest}Z`).toISOString();
}

/**
 * Convert 'YY-MM-DD HH:MM:SS' (UTC) to Unix seconds.
 */
function tiempoToUnix(tiempo) {
  const yyyy = '20' + tiempo.slice(0, 2);
  const rest = tiempo.slice(2);
  return Math.floor(new Date(`${yyyy}${rest}Z`).getTime() / 1000);
}

module.exports = { parseBinanceCsv };
