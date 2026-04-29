'use strict';

/**
 * Initialises the SQLite schema.
 * @param {import('better-sqlite3').Database} db
 */
function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id           TEXT PRIMARY KEY,
      source       TEXT NOT NULL,
      type         TEXT NOT NULL CHECK(type IN ('BUY','SELL','SWAP_IN','SWAP_OUT')),
      crypto       TEXT NOT NULL,
      amount       REAL NOT NULL CHECK(amount > 0),
      price_eur    REAL NOT NULL CHECK(price_eur >= 0),
      total_eur    REAL NOT NULL CHECK(total_eur >= 0),
      fee_eur      REAL DEFAULT 0 CHECK(fee_eur >= 0),
      date         TEXT NOT NULL,
      raw_pair     TEXT,
      imported_at  TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_tx_crypto_date ON transactions(crypto, date);

    CREATE TABLE IF NOT EXISTS price_cache (
      crypto     TEXT NOT NULL,
      date       TEXT NOT NULL,
      price_eur  REAL NOT NULL,
      PRIMARY KEY (crypto, date)
    );

    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

module.exports = { initSchema };
