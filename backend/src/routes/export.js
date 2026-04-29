'use strict';

const express              = require('express');
const db                   = require('../db/db');
const { calculateFifo }    = require('../services/fifo');
const { generateIrpfCsv }  = require('../services/export');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/export/csv?year=YYYY
// ---------------------------------------------------------------------------

router.get('/csv', (req, res, next) => {
  try {
    const { year } = req.query;

    if (!year || !/^\d{4}$/.test(year)) {
      return res.status(400).json({ error: 'year query param is required (4-digit number)' });
    }

    const yearInt      = parseInt(year, 10);
    const transactions = db.prepare('SELECT * FROM transactions ORDER BY date ASC').all();
    const allResults   = calculateFifo(transactions);
    const results      = allResults.filter(r => r.year === yearInt);

    const csv = generateIrpfCsv(results);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="IRPF-${yearInt}-FIFO.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
