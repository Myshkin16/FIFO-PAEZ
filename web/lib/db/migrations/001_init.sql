-- Postgres equivalent of the SQLite schema after the local migration system
-- caught up to user_version=2. New cloud installs run this once. Existing
-- SQLite data is imported via web/scripts/migrate-from-sqlite.js.

CREATE TABLE IF NOT EXISTS transactions (
  id           TEXT PRIMARY KEY,
  source       TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('BUY','SELL','SWAP_IN','SWAP_OUT')),
  crypto       TEXT NOT NULL,
  amount       DOUBLE PRECISION NOT NULL CHECK (amount > 0),
  price_eur    DOUBLE PRECISION NOT NULL CHECK (price_eur >= 0),
  total_eur    DOUBLE PRECISION NOT NULL CHECK (total_eur >= 0),
  fee_eur      DOUBLE PRECISION DEFAULT 0 CHECK (fee_eur >= 0),
  date         TIMESTAMPTZ NOT NULL,
  raw_pair     TEXT,
  imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tx_crypto_date ON transactions(crypto, date);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);

CREATE TABLE IF NOT EXISTS price_cache (
  crypto      TEXT NOT NULL,
  date        TEXT NOT NULL,
  price_eur   DOUBLE PRECISION NOT NULL,
  source      TEXT,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (crypto, date)
);

CREATE TABLE IF NOT EXISTS config (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- Migration tracking (Postgres has no PRAGMA user_version equivalent).
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
