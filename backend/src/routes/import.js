'use strict';

const express = require('express');
const multer  = require('multer');

const db                    = require('../db/db');
const { fetchKrakenHistory } = require('../services/kraken');
const { parseBinanceCsv }   = require('../services/binance');
const { decrypt }           = require('./config');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ---------------------------------------------------------------------------
// Shared DB helpers
// ---------------------------------------------------------------------------

const stmtExists = db.prepare('SELECT 1 FROM transactions WHERE id = ?');
const stmtUpsert = db.prepare(`
  INSERT OR REPLACE INTO transactions
    (id, source, type, crypto, amount, price_eur, total_eur, fee_eur, date, raw_pair)
  VALUES
    (@id, @source, @type, @crypto, @amount, @price_eur, @total_eur, @fee_eur, @date, @raw_pair)
`);

/**
 * Inserts an array of transaction objects, returning {imported, skipped}.
 */
function bulkInsert(txs) {
  let imported = 0;
  let skipped  = 0;

  const run = db.transaction(() => {
    for (const tx of txs) {
      const exists = stmtExists.get(tx.id);
      if (exists) {
        skipped++;
      } else {
        stmtUpsert.run({
          id:        tx.id,
          source:    tx.source,
          type:      tx.type,
          crypto:    tx.crypto,
          amount:    tx.amount,
          price_eur: tx.price_eur,
          total_eur: tx.total_eur,
          fee_eur:   tx.fee_eur   || 0,
          date:      tx.date,
          raw_pair:  tx.raw_pair  || null,
        });
        imported++;
      }
    }
  });

  run();
  return { imported, skipped };
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
    const result       = bulkInsert(transactions);

    res.json(result);
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

    const transactions = await parseBinanceCsv(req.file.buffer);
    const result       = bulkInsert(transactions);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
