'use strict';

/**
 * Pure FIFO calculation engine — no I/O, no DB calls.
 *
 * @typedef {Object} Transaction
 * @property {string} id
 * @property {string} source
 * @property {string} type        - BUY | SELL | SWAP_IN | SWAP_OUT
 * @property {string} crypto
 * @property {number} amount
 * @property {number} price_eur
 * @property {number} total_eur
 * @property {number} fee_eur
 * @property {string} date        - ISO 8601
 *
 * @typedef {Object} FifoResult
 * @property {string}  sellDate
 * @property {string}  crypto
 * @property {number}  amountSold
 * @property {number}  costBasis
 * @property {number}  saleProceeds
 * @property {number}  fees
 * @property {number}  gainLoss
 * @property {number}  year
 * @property {string}  source
 * @property {Array}   buyLots     - [{date, amount, priceEur}]
 */

/**
 * Calculates capital gains/losses using the FIFO method.
 *
 * @param {Transaction[]} transactions
 * @returns {FifoResult[]}
 */
function calculateFifo(transactions) {
  // Separate acquisitions and disposals
  const ACQUISITION_TYPES = new Set(['BUY', 'SWAP_IN']);
  const DISPOSAL_TYPES    = new Set(['SELL', 'SWAP_OUT']);

  const acquisitions = transactions.filter(t => ACQUISITION_TYPES.has(t.type));
  const disposals    = transactions.filter(t => DISPOSAL_TYPES.has(t.type));

  // Group by crypto
  /** @type {Map<string, Transaction[]>} */
  const buyQueues  = groupByCrypto(acquisitions);
  /** @type {Map<string, Transaction[]>} */
  const sellGroups = groupByCrypto(disposals);

  // Sort each buy queue by date ASC → FIFO
  for (const [, queue] of buyQueues) {
    queue.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  const results = [];

  for (const [crypto, sells] of sellGroups) {
    // Sort sells by date ASC
    const sortedSells = [...sells].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Clone the buy queue into mutable lots so we can track partial consumption
    const rawQueue = (buyQueues.get(crypto) || []).map(b => ({
      date:       b.date,
      priceEur:   b.price_eur,
      feeEur:     b.fee_eur || 0,
      remaining:  b.amount,
      original:   b.amount,
    }));

    for (const sell of sortedSells) {
      let remainingToSell = sell.amount;
      let costBasis = 0;
      const buyLots = [];

      while (remainingToSell > 1e-10 && rawQueue.length > 0) {
        const lot = rawQueue[0];

        if (lot.remaining <= remainingToSell) {
          // Consume entire lot
          const consumed = lot.remaining;
          // Proportional fee for this lot
          const lotFeeProportion = lot.original > 0 ? consumed / lot.original : 0;
          const lotCost = consumed * lot.priceEur + lot.feeEur * lotFeeProportion;

          costBasis += lotCost;
          buyLots.push({ date: lot.date, amount: consumed, priceEur: lot.priceEur });

          remainingToSell -= consumed;
          rawQueue.shift(); // lot fully consumed
        } else {
          // Partially consume lot
          const consumed = remainingToSell;
          const lotFeeProportion = lot.original > 0 ? consumed / lot.original : 0;
          const lotCost = consumed * lot.priceEur + lot.feeEur * lotFeeProportion;

          costBasis += lotCost;
          buyLots.push({ date: lot.date, amount: consumed, priceEur: lot.priceEur });

          lot.remaining -= consumed;
          remainingToSell = 0;
        }
      }

      const saleProceeds = sell.total_eur;
      const fees         = sell.fee_eur || 0;
      const gainLoss     = saleProceeds - costBasis - fees;

      results.push({
        sellDate:     sell.date,
        crypto,
        amountSold:   sell.amount,
        costBasis:    round(costBasis),
        saleProceeds: round(saleProceeds),
        fees:         round(fees),
        gainLoss:     round(gainLoss),
        year:         new Date(sell.date).getFullYear(),
        source:       sell.source,
        buyLots,
      });
    }
  }

  return results;
}

/**
 * Groups an array of transactions by their `crypto` field.
 * @param {Transaction[]} txs
 * @returns {Map<string, Transaction[]>}
 */
function groupByCrypto(txs) {
  const map = new Map();
  for (const tx of txs) {
    if (!map.has(tx.crypto)) map.set(tx.crypto, []);
    map.get(tx.crypto).push(tx);
  }
  return map;
}

/** Round to 8 decimal places to avoid floating-point noise. */
function round(n) {
  return Math.round(n * 1e8) / 1e8;
}

module.exports = { calculateFifo };
