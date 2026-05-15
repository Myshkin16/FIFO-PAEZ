// CSV parsers for Binance Trade History (English) and Transaction History
// (Spanish). Functionally identical to backend/src/services/binance.js — the
// only differences are ESM imports and that getPriceEur/warmPriceCache now
// hit Postgres instead of SQLite (transparent to this file).

import { parse } from 'csv-parse/sync'
import { getPriceEur, warmPriceCache } from './prices.js'

const USD_STABLES = new Set(['USDT', 'USDC', 'BUSD', 'TUSD', 'FDUSD', 'DAI'])
const FIAT_CURRENCIES = new Set(['EUR', 'USD', 'GBP', 'CHF'])

/**
 * @returns {Promise<{transactions: object[], skipped: Array<{reason, detail}>}>}
 */
export async function parseBinanceCsv(csvBuffer, onProgress) {
  const text = (Buffer.isBuffer(csvBuffer) ? csvBuffer.toString('utf8') : String(csvBuffer))
    .replace(/^﻿/, '')

  const firstLine = (text.split(/\r?\n/)[0] || '').toLowerCase()

  if (
    firstLine.includes('id de usuario') ||
    firstLine.includes('operación') ||
    firstLine.includes('operacion')
  ) {
    return parseTransactionHistory(text, onProgress)
  }
  return parseTradeHistory(text, onProgress)
}

// ---------------------------------------------------------------------------
// Trade History (English)
// ---------------------------------------------------------------------------

async function parseTradeHistory(text, onProgress) {
  let rows
  try {
    rows = parse(text, { columns: true, skip_empty_lines: true, trim: true })
  } catch (err) {
    throw new Error(
      `Failed to parse Binance CSV: ${err.message}. ` +
      `Make sure you exported "Trade History" or "Transaction History" from Binance.`
    )
  }

  const skipped = []

  const pricesNeeded = []
  for (const row of rows) {
    const r = normaliseKeys(row)
    const dateUtc = r['date(utc)'] || r['date']
    const pair    = r['pair'] || ''
    if (!dateUtc || !pair) continue
    const dateStr = dateUtc.slice(0, 10)
    const { base, quote } = splitPair(pair)
    pricesNeeded.push({ symbol: base, dateStr })
    pricesNeeded.push({ symbol: quote, dateStr })
    const { currency: feeCurrency } = parseValueWithCurrency(r['fee'] || '')
    if (feeCurrency) pricesNeeded.push({ symbol: feeCurrency, dateStr })
  }
  await warmPriceCache(pricesNeeded, onProgress)

  const results = []

  for (const row of rows) {
    const r = normaliseKeys(row)
    const dateUtc   = r['date(utc)'] || r['date']
    const pair      = r['pair']      || ''
    const side      = (r['side']     || '').toUpperCase()
    const executed  = r['executed']  || ''
    const amountRaw = r['amount']    || ''
    const feeRaw    = r['fee']       || ''
    const priceRaw  = r['price']     || ''

    if (!dateUtc || !pair || !side) {
      skipped.push({
        reason: 'missing-fields',
        detail: `Row missing date/pair/side: ${JSON.stringify(r).slice(0, 200)}`,
      })
      continue
    }

    const { base, quote } = splitPair(pair)
    const { value: executedAmount } = parseValueWithCurrency(executed)
    const { value: amountValue } = parseValueWithCurrency(amountRaw)
    const { value: feeValue, currency: feeCurrency } = parseValueWithCurrency(feeRaw)
    const priceValue = parseFloat(priceRaw) || 0

    const dateStr = dateUtc.slice(0, 10)
    // Strip any trailing timezone designator before appending Z, in case
    // Binance ever exports zoned datestrings.
    const cleanDate = dateUtc.trim().replace(/[Zz]$|[+-]\d{2}:?\d{2}$/, '')
    const isoDate = new Date(cleanDate + 'Z').toISOString()

    let priceEur
    if (quote === 'EUR') {
      priceEur = priceValue
    } else {
      try { priceEur = await getPriceEur(base, dateStr) }
      catch { priceEur = priceValue }
    }

    let feeEur = 0
    if (feeCurrency === 'EUR') {
      feeEur = feeValue
    } else if (feeCurrency === base) {
      feeEur = feeValue * priceEur
    } else if (feeCurrency) {
      try {
        const feePriceEur = await getPriceEur(feeCurrency, dateStr)
        feeEur = feeValue * feePriceEur
      } catch {
        feeEur = feeValue * priceEur
      }
    }

    const amount = executedAmount
    const totalEur = quote === 'EUR' ? amountValue : amount * priceEur
    const type = side === 'BUY' ? 'BUY' : 'SELL'

    const id = `binance_${dateUtc}_${pair}_${side}_${results.length}`.replace(/\s+/g, '_')

    results.push({
      id,
      source: 'binance',
      type,
      crypto: base,
      amount,
      price_eur: priceEur,
      total_eur: totalEur,
      fee_eur: feeEur,
      date: isoDate,
      raw_pair: pair,
    })
  }

  return { transactions: results, skipped }
}

// ---------------------------------------------------------------------------
// Transaction History (Spanish)
// ---------------------------------------------------------------------------

const IGNORED_OPS = new Set([
  'Transfer Between Spot Account and UM Futures Account',
  'Deposit',
  'Withdraw',
])

async function parseTransactionHistory(text, onProgress) {
  let rows
  try {
    rows = parse(text, { columns: true, skip_empty_lines: true, trim: true })
  } catch (err) {
    throw new Error(
      `Failed to parse Binance CSV: ${err.message}. ` +
      `Make sure you exported "Transaction History" or "Trade History" from Binance.`
    )
  }

  const skipped = []
  const norm = []
  for (const row of rows) {
    const r = normaliseKeys(row)
    const tiempo  = r['tiempo'] || ''
    const cuenta  = r['cuenta'] || ''
    const operacion = r['operación'] || r['operacion'] || ''
    const moneda  = (r['moneda'] || '').toUpperCase()
    const cambio  = parseFloat(r['cambio']) || 0
    const obs     = r['observación'] || r['observacion'] || ''
    if (!tiempo || !operacion) continue
    if (cuenta !== 'Spot') continue
    if (IGNORED_OPS.has(operacion)) continue
    norm.push({ tiempo, operacion, moneda, cambio, obs })
  }

  const pricesNeeded = norm.map(r => ({
    symbol: r.moneda,
    dateStr: `20${r.tiempo.slice(0, 8)}`,
  }))
  await warmPriceCache(pricesNeeded, onProgress)

  const byTime = new Map()
  for (const r of norm) {
    if (!byTime.has(r.tiempo)) byTime.set(r.tiempo, [])
    byTime.get(r.tiempo).push(r)
  }

  const timestamps = Array.from(byTime.keys()).sort()
  const pendingConvert = []
  const results = []

  for (const tiempo of timestamps) {
    const group = byTime.get(tiempo)

    const buys    = group.filter(r => r.operacion === 'Transaction Buy')
    const spends  = group.filter(r => r.operacion === 'Transaction Spend')
    const sold    = group.filter(r => r.operacion === 'Transaction Sold')
    const revenue = group.filter(r => r.operacion === 'Transaction Revenue')
    const fees    = group.filter(r => r.operacion === 'Transaction Fee')
    const convert = group.filter(r => r.operacion === 'Binance Convert')
    const dust    = group.filter(r => r.operacion === 'Small Assets Exchange BNB')

    if (buys.length > 0) {
      const buyTxs = await pairTradeRows({
        type: 'BUY', baseRows: buys, counterRows: spends, feeRows: fees,
        tiempo, startIdSuffix: results.length, skipped,
      })
      results.push(...buyTxs)
    }
    if (sold.length > 0) {
      const sellTxs = await pairTradeRows({
        type: 'SELL', baseRows: sold, counterRows: revenue, feeRows: fees,
        tiempo, startIdSuffix: results.length, skipped,
      })
      results.push(...sellTxs)
    }

    for (const c of convert) {
      pendingConvert.push({ tiempo, moneda: c.moneda, cambio: c.cambio })
    }

    if (dust.length > 0) {
      const byObs = new Map()
      for (const d of dust) {
        const key = d.obs || `${d.moneda}_${d.cambio < 0 ? 'neg' : 'pos'}`
        if (!byObs.has(key)) byObs.set(key, [])
        byObs.get(key).push(d)
      }
      for (const [, pair] of byObs) {
        const negRow = pair.find(p => p.cambio < 0)
        const posRow = pair.find(p => p.cambio > 0 && p.moneda === 'BNB')
        if (!negRow) {
          skipped.push({
            reason: 'dust-no-source',
            detail: `Dust group at ${tiempo} has no negative-side row: ${JSON.stringify(pair).slice(0, 200)}`,
          })
          continue
        }
        const base = negRow.moneda
        const baseAmount = -negRow.cambio
        const bnbAmount = posRow ? posRow.cambio : 0
        const tx = await buildTrade({
          type: 'SELL', base, baseAmount, quoteMoneda: 'BNB', quoteAmount: bnbAmount,
          baseFeeAmount: 0, otherFeeContribs: [], tiempo, idSuffix: results.length, rawPair: 'DUST',
        })
        results.push(tx)
      }
    }
  }

  pendingConvert.sort((a, b) => a.tiempo.localeCompare(b.tiempo))
  while (pendingConvert.length > 0) {
    const first = pendingConvert.shift()
    let mateIdx = -1
    for (let i = 0; i < pendingConvert.length; i++) {
      const cand = pendingConvert[i]
      if (Math.sign(cand.cambio) !== Math.sign(first.cambio)) {
        const tdiff = Math.abs(tiempoToUnix(cand.tiempo) - tiempoToUnix(first.tiempo))
        if (tdiff <= 5) { mateIdx = i; break }
      }
    }
    if (mateIdx === -1) {
      skipped.push({
        reason: 'convert-orphan',
        detail: `Binance Convert row at ${first.tiempo} (${first.moneda} ${first.cambio}) has no mate within 5s`,
      })
      continue
    }
    const mate = pendingConvert.splice(mateIdx, 1)[0]
    const negRow = first.cambio < 0 ? first : mate
    const posRow = first.cambio > 0 ? first : mate
    const tiempo = first.tiempo <= mate.tiempo ? first.tiempo : mate.tiempo

    if (!FIAT_CURRENCIES.has(negRow.moneda)) {
      results.push(await buildTrade({
        type: 'SELL', base: negRow.moneda, baseAmount: -negRow.cambio,
        quoteMoneda: posRow.moneda, quoteAmount: posRow.cambio,
        baseFeeAmount: 0, otherFeeContribs: [], tiempo,
        idSuffix: results.length, rawPair: 'CONVERT',
      }))
    }
    if (!FIAT_CURRENCIES.has(posRow.moneda)) {
      results.push(await buildTrade({
        type: 'BUY', base: posRow.moneda, baseAmount: posRow.cambio,
        quoteMoneda: negRow.moneda, quoteAmount: -negRow.cambio,
        baseFeeAmount: 0, otherFeeContribs: [], tiempo,
        idSuffix: results.length, rawPair: 'CONVERT',
      }))
    }
  }

  return { transactions: results, skipped }
}

async function pairTradeRows({ type, baseRows, counterRows, feeRows, tiempo, startIdSuffix, skipped }) {
  const baseSet = new Set(baseRows.map(r => r.moneda))
  const counterType = type === 'BUY' ? 'SELL' : 'BUY'
  const out = []

  const pushPair = async (params) => {
    const { base, baseAmount, quoteMoneda, quoteAmount, baseFeeAmount, otherFeeContribs } = params
    if (!FIAT_CURRENCIES.has(base)) {
      out.push(await buildTrade({
        type, base, baseAmount, quoteMoneda, quoteAmount,
        baseFeeAmount, otherFeeContribs, tiempo,
        idSuffix: startIdSuffix + out.length,
      }))
    }
    if (quoteMoneda && !FIAT_CURRENCIES.has(quoteMoneda)) {
      const counterBaseFee = feeRows
        .filter(f => f.moneda === quoteMoneda)
        .reduce((s, f) => s + Math.abs(f.cambio), 0)
      const counterOtherFees = otherFeeContribs.filter(f => f.moneda !== quoteMoneda)
      out.push(await buildTrade({
        type: counterType, base: quoteMoneda, baseAmount: quoteAmount,
        quoteMoneda: base, quoteAmount: baseAmount,
        baseFeeAmount: counterBaseFee, otherFeeContribs: counterOtherFees, tiempo,
        idSuffix: startIdSuffix + out.length, rawPair: `${quoteMoneda}/${base}`,
      }))
    }
  }

  if (baseSet.size === 1) {
    const base = baseRows[0].moneda
    const baseAmount = baseRows.reduce((s, r) => s + Math.abs(r.cambio), 0)
    const quoteMoneda = counterRows[0]?.moneda || ''
    const quoteAmount = counterRows.reduce((s, r) => s + Math.abs(r.cambio), 0)
    const baseFeeAmount = feeRows.filter(f => f.moneda === base).reduce((s, f) => s + Math.abs(f.cambio), 0)
    const otherFeeContribs = feeRows.filter(f => f.moneda !== base)
      .map(f => ({ moneda: f.moneda, amount: Math.abs(f.cambio) }))
    await pushPair({ base, baseAmount, quoteMoneda, quoteAmount, baseFeeAmount, otherFeeContribs })
    return out
  }

  const n = Math.min(baseRows.length, counterRows.length)
  if (baseRows.length !== counterRows.length && skipped) {
    skipped.push({
      reason: 'multi-base-mismatch',
      detail:
        `At ${tiempo}: ${baseRows.length} base rows vs ${counterRows.length} counter rows; ` +
        `extra ${Math.abs(baseRows.length - counterRows.length)} unpaired ` +
        `(${type === 'BUY' ? 'Buy/Spend' : 'Sold/Revenue'}) row(s) dropped.`,
    })
  }
  const perBase = new Map()
  for (let i = 0; i < n; i++) {
    const br = baseRows[i]; const cr = counterRows[i]
    const base = br.moneda
    const acc = perBase.get(base) || { baseAmount: 0, quoteMoneda: cr.moneda, quoteAmount: 0 }
    acc.baseAmount  += Math.abs(br.cambio)
    acc.quoteAmount += Math.abs(cr.cambio)
    perBase.set(base, acc)
  }
  const totalCounter = Array.from(perBase.values()).reduce((s, v) => s + v.quoteAmount, 0) || 1
  for (const [base, acc] of perBase) {
    const baseFeeAmount = feeRows.filter(f => f.moneda === base).reduce((s, f) => s + Math.abs(f.cambio), 0)
    const share = acc.quoteAmount / totalCounter
    const otherFeeContribs = feeRows.filter(f => !baseSet.has(f.moneda))
      .map(f => ({ moneda: f.moneda, amount: Math.abs(f.cambio) * share }))
    await pushPair({
      base, baseAmount: acc.baseAmount, quoteMoneda: acc.quoteMoneda,
      quoteAmount: acc.quoteAmount, baseFeeAmount, otherFeeContribs,
    })
  }
  return out
}

async function buildTrade(args) {
  const { type, base, baseAmount, quoteMoneda, quoteAmount, baseFeeAmount, otherFeeContribs, tiempo, idSuffix } = args
  const dateStr = `20${tiempo.slice(0, 8)}`
  const isoDate = tiempoToIso(tiempo)

  let priceEur, totalEur
  if (base === 'EUR') {
    priceEur = 1; totalEur = baseAmount
  } else if (quoteMoneda === 'EUR') {
    totalEur = quoteAmount; priceEur = baseAmount > 0 ? totalEur / baseAmount : 0
  } else if (USD_STABLES.has(quoteMoneda)) {
    const stableEur = await safePriceEur(quoteMoneda, dateStr)
    totalEur = quoteAmount * stableEur
    priceEur = baseAmount > 0 ? totalEur / baseAmount : 0
    if (!priceEur) {
      priceEur = await safePriceEur(base, dateStr)
      totalEur = baseAmount * priceEur
    }
  } else {
    priceEur = await safePriceEur(base, dateStr)
    totalEur = baseAmount * priceEur
  }

  let feeEur = 0
  if (baseFeeAmount > 0) feeEur += baseFeeAmount * priceEur
  for (const f of otherFeeContribs) {
    if (!f.amount) continue
    if (f.moneda === 'EUR') { feeEur += f.amount; continue }
    const p = await safePriceEur(f.moneda, dateStr)
    feeEur += f.amount * p
  }

  const rawPair = args.rawPair || `${base}/${quoteMoneda || '?'}`
  const id = `binance_${tiempoToUnix(tiempo)}_${type}_${base}_${quoteMoneda || 'X'}_${idSuffix}`

  return {
    id, source: 'binance', type, crypto: base,
    amount: baseAmount, price_eur: priceEur, total_eur: totalEur, fee_eur: feeEur,
    date: isoDate, raw_pair: rawPair,
  }
}

async function safePriceEur(symbol, dateStr) {
  try { return await getPriceEur(symbol, dateStr) } catch { return 0 }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normaliseKeys(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) out[k.trim().toLowerCase()] = v
  return out
}

const KNOWN_QUOTES = ['USDT', 'USDC', 'BUSD', 'TUSD', 'EUR', 'USD', 'GBP', 'BTC', 'ETH', 'BNB']
function splitPair(pair) {
  const upper = pair.toUpperCase()
  for (const q of KNOWN_QUOTES) {
    if (upper.endsWith(q)) return { base: upper.slice(0, upper.length - q.length), quote: q }
  }
  return { base: upper.slice(0, 3), quote: upper.slice(3) }
}

function parseValueWithCurrency(str) {
  const trimmed = (str || '').trim()
  const match = trimmed.match(/^([\d.]+)\s*([A-Za-z]*)$/)
  if (!match) return { value: 0, currency: '' }
  return { value: parseFloat(match[1]) || 0, currency: match[2].toUpperCase() }
}

function tiempoToIso(tiempo) {
  const yyyy = '20' + tiempo.slice(0, 2)
  const rest = tiempo.slice(2)
  return new Date(`${yyyy}${rest}Z`).toISOString()
}

function tiempoToUnix(tiempo) {
  const yyyy = '20' + tiempo.slice(0, 2)
  const rest = tiempo.slice(2)
  return Math.floor(new Date(`${yyyy}${rest}Z`).getTime() / 1000)
}
