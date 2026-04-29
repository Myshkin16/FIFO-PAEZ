'use strict';

const express          = require('express');
const db               = require('../db/db');
const { calculateFifo } = require('../services/fifo');

const router = express.Router();

// ---------------------------------------------------------------------------
// Spanish IRPF tax tranches (2024)
// 19% on first €6,000
// 21% on €6,000 – €50,000
// 23% on €50,000 – €200,000
// 27% on €200,000 – €300,000
// 28% above €300,000
// ---------------------------------------------------------------------------

function calcTaxEstimate(gainLoss) {
  if (gainLoss <= 0) return 0;

  const TRANCHES = [
    { limit:   6_000, rate: 0.19 },
    { limit:  50_000, rate: 0.21 },
    { limit: 200_000, rate: 0.23 },
    { limit: 300_000, rate: 0.27 },
    { limit: Infinity, rate: 0.28 },
  ];

  let remaining = gainLoss;
  let tax       = 0;
  let prev      = 0;

  for (const tranche of TRANCHES) {
    const bracket = tranche.limit - prev;
    const taxable = Math.min(remaining, bracket);
    tax      += taxable * tranche.rate;
    remaining -= taxable;
    prev       = tranche.limit;
    if (remaining <= 0) break;
  }

  return Math.round(tax * 100) / 100;
}

// ---------------------------------------------------------------------------
// Fetch all transactions from DB
// ---------------------------------------------------------------------------

function getAllTransactions() {
  return db.prepare('SELECT * FROM transactions ORDER BY date ASC').all();
}

// ---------------------------------------------------------------------------
// GET /api/fifo?year=YYYY
// ---------------------------------------------------------------------------

router.get('/', (req, res, next) => {
  try {
    const { year } = req.query;

    if (!year || !/^\d{4}$/.test(year)) {
      return res.status(400).json({ error: 'year query param is required (4-digit number)' });
    }

    const yearInt      = parseInt(year, 10);
    const transactions = getAllTransactions();
    const allResults   = calculateFifo(transactions);
    const results      = allResults.filter(r => r.year === yearInt);

    const gainLoss    = results.reduce((sum, r) => sum + r.gainLoss, 0);
    const taxEstimate = calcTaxEstimate(gainLoss);

    res.json({
      year:    yearInt,
      results,
      totals:  {
        gainLoss:    Math.round(gainLoss * 100) / 100,
        taxEstimate,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/fifo/summary
// ---------------------------------------------------------------------------

router.get('/summary', (req, res, next) => {
  try {
    const transactions = getAllTransactions();
    const allResults   = calculateFifo(transactions);

    // Group by year
    const byYear = new Map();

    for (const r of allResults) {
      if (!byYear.has(r.year)) {
        byYear.set(r.year, { gainLoss: 0, count: 0 });
      }
      const entry = byYear.get(r.year);
      entry.gainLoss += r.gainLoss;
      entry.count++;
    }

    const years = Array.from(byYear.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, data]) => {
        const gainLoss    = Math.round(data.gainLoss * 100) / 100;
        const taxEstimate = calcTaxEstimate(gainLoss);
        return {
          year,
          gainLoss,
          taxEstimate,
          operationsCount: data.count,
        };
      });

    res.json({ years });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
