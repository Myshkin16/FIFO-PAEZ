'use strict';

const express = require('express');
const multer  = require('multer');

const db                    = require('../db/db');
const { fetchKrakenHistory } = require('../services/kraken');
const { parseBinanceCsv }   = require('../services/binance');
const { decrypt }           = require('./config');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are accepted'));
    }
  },
});

// ---------------------------------------------------------------------------
// Shared DB helpers
// ---------------------------------------------------------------------------

const stmtInsert = db.prepare(`INSERT OR IGNORE INTO transactions (id, source, type, crypto, amount, price_eur, total_eur, fee_eur, date, raw_pair) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

/**
 * Inserts an array of transaction objects, returning {imported, skipped}.
 */
function bulkInsert(txs) {
  const insertMany = db.transaction((txs) => {
    let imported = 0, duplicates = 0;
    for (const tx of txs) {
      const result = stmtInsert.run(tx.id, tx.source, tx.type, tx.crypto, tx.amount, tx.price_eur, tx.total_eur, tx.fee_eur, tx.date, tx.raw_pair || null);
      if (result.changes === 1) imported++;
      else duplicates++;
    }
    return { imported, duplicates };
  });

  return insertMany(txs);
}

// ---------------------------------------------------------------------------
// POST /api/import/kraken
// ---------------------------------------------------------------------------

router.post('/kraken', async (req, res, next) => {
  try {
    const apiKeyRow      = db.prepare("SELECT value FROM config WHERE key = 'kraken_api_key'").get();
    const privateKeyRow  = db.prepare("SELECT value FROM config WHERE key = 'kraken_private_key'").get();

    if (!apiKeyRow || !privateKeyRow) {
      return res.status(400).json({ error: 'Kraken API keys not configured' });
    }

    const apiKey     = decrypt(apiKeyRow.value);
    const privateKey = decrypt(privateKeyRow.value);

    const transactions = await fetchKrakenHistory(apiKey, privateKey);
    const { imported, duplicates } = bulkInsert(transactions);

    res.json({ imported, duplicates, skipped: [] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/import/binance
// ---------------------------------------------------------------------------

router.post('/binance', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { transactions, skipped } = await parseBinanceCsv(req.file.buffer);
    const { imported, duplicates } = bulkInsert(transactions);

    res.json({ imported, duplicates, skipped });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
