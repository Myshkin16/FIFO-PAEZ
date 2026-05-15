// Pure FIFO calculation engine — no I/O, no DB calls. Copied verbatim from
// backend/src/services/fifo.js. If you change one, change the other (until
// the backend/ folder is retired after Slice 4 is live).

const ACQUISITION_TYPES = new Set(['BUY', 'SWAP_IN'])
const DISPOSAL_TYPES    = new Set(['SELL', 'SWAP_OUT'])

export function calculateFifo(transactions) {
  const acquisitions = transactions.filter(t => ACQUISITION_TYPES.has(t.type))
  const disposals    = transactions.filter(t => DISPOSAL_TYPES.has(t.type))

  const buyQueues  = groupByCrypto(acquisitions)
  const sellGroups = groupByCrypto(disposals)

  for (const [, queue] of buyQueues) {
    queue.sort((a, b) => new Date(a.date) - new Date(b.date))
  }

  const results = []

  for (const [crypto, sells] of sellGroups) {
    const sortedSells = [...sells].sort((a, b) => new Date(a.date) - new Date(b.date))

    const rawQueue = (buyQueues.get(crypto) || []).map(b => ({
      date:       b.date,
      priceEur:   b.price_eur,
      feeEur:     b.fee_eur || 0,
      remaining:  b.amount,
      original:   b.amount,
    }))

    for (const sell of sortedSells) {
      let remainingToSell = sell.amount
      let costBasis = 0
      const buyLots = []

      while (remainingToSell > 1e-10 && rawQueue.length > 0) {
        const lot = rawQueue[0]

        if (lot.remaining <= remainingToSell) {
          const consumed = lot.remaining
          const lotFeeProportion = lot.original > 0 ? consumed / lot.original : 0
          const lotCost = consumed * lot.priceEur + lot.feeEur * lotFeeProportion

          costBasis += lotCost
          buyLots.push({ date: lot.date, amount: consumed, priceEur: lot.priceEur })

          remainingToSell -= consumed
          rawQueue.shift()
        } else {
          const consumed = remainingToSell
          const lotFeeProportion = lot.original > 0 ? consumed / lot.original : 0
          const lotCost = consumed * lot.priceEur + lot.feeEur * lotFeeProportion

          costBasis += lotCost
          buyLots.push({ date: lot.date, amount: consumed, priceEur: lot.priceEur })

          lot.remaining -= consumed
          remainingToSell = 0
        }
      }

      const warning = remainingToSell > 1e-10
        ? `Insufficient buy inventory: ${remainingToSell.toFixed(8)} ${crypto} unmatched — cost basis may be understated`
        : undefined

      const saleProceeds = sell.total_eur
      const fees         = sell.fee_eur || 0
      const gainLoss     = saleProceeds - costBasis - fees

      results.push({
        sellDate:     sell.date,
        crypto,
        amountSold:   sell.amount,
        costBasis:    round(costBasis),
        saleProceeds: round(saleProceeds),
        fees:         round(fees),
        gainLoss:     round(gainLoss),
        year:         new Date(sell.date).getUTCFullYear(),
        source:       sell.source,
        buyLots,
        warning,
      })
    }
  }

  return results
}

function groupByCrypto(txs) {
  const map = new Map()
  for (const tx of txs) {
    if (!map.has(tx.crypto)) map.set(tx.crypto, [])
    map.get(tx.crypto).push(tx)
  }
  return map
}

function round(n) {
  return Math.round(n * 1e8) / 1e8
}

const TAX_TRANCHES = [
  { limit:   6_000, rate: 0.19 },
  { limit:  50_000, rate: 0.21 },
  { limit: 200_000, rate: 0.23 },
  { limit: 300_000, rate: 0.27 },
  { limit: Infinity, rate: 0.28 },
]

export function calcTaxEstimate(gainLoss) {
  if (gainLoss <= 0) return 0
  let remaining = gainLoss
  let tax = 0
  let prev = 0
  for (const t of TAX_TRANCHES) {
    const bracket = t.limit - prev
    const taxable = Math.min(remaining, bracket)
    tax += taxable * t.rate
    remaining -= taxable
    prev = t.limit
    if (remaining <= 0) break
  }
  return Math.round(tax * 100) / 100
}
