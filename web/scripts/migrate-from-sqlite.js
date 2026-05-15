// One-shot migration: copies every row from backend/crypto_fifo.db into the
// Postgres DB pointed at by DATABASE_URL. Idempotent — uses ON CONFLICT
// DO NOTHING so re-running is safe.
//
// Usage (from repo root, after `vercel env pull web/.env.local`):
//
//   cd web
//   node --env-file=.env.local scripts/migrate-from-sqlite.js
//
// Defaults:
//   SQLITE_PATH = ../backend/crypto_fifo.db (relative to web/)
//   Override with: SQLITE_PATH=/path/to/file.db node ...

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { getClient } from '../lib/db/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SQLITE_PATH = process.env.SQLITE_PATH || path.resolve(__dirname, '..', '..', 'backend', 'crypto_fifo.db')

async function main() {
  console.log(`[migrate] Source SQLite: ${SQLITE_PATH}`)
  const sqlite = new Database(SQLITE_PATH, { readonly: true })
  const pg = getClient()
  await pg.connect()

  try {
    // 1. transactions
    const txs = sqlite.prepare('SELECT * FROM transactions').all()
    console.log(`[migrate] transactions: ${txs.length} rows`)
    let txImported = 0, txDup = 0
    await pg.query('BEGIN')
    for (const t of txs) {
      const r = await pg.query(
        `INSERT INTO transactions
          (id, source, type, crypto, amount, price_eur, total_eur, fee_eur, date, raw_pair, imported_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11::timestamptz, NOW()))
         ON CONFLICT (id) DO NOTHING`,
        [
          t.id, t.source, t.type, t.crypto, t.amount,
          t.price_eur, t.total_eur, t.fee_eur, t.date, t.raw_pair, t.imported_at,
        ],
      )
      if (r.rowCount === 1) txImported++
      else txDup++
    }
    await pg.query('COMMIT')
    console.log(`[migrate]   imported: ${txImported}, duplicates: ${txDup}`)

    // 2. price_cache
    const prices = sqlite.prepare('SELECT * FROM price_cache').all()
    console.log(`[migrate] price_cache: ${prices.length} rows`)
    let pImported = 0
    await pg.query('BEGIN')
    for (const p of prices) {
      const r = await pg.query(
        `INSERT INTO price_cache (crypto, date, price_eur, source, fetched_at)
         VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()))
         ON CONFLICT (crypto, date) DO UPDATE
         SET price_eur = EXCLUDED.price_eur,
             source    = EXCLUDED.source,
             fetched_at = EXCLUDED.fetched_at`,
        [p.crypto, p.date, p.price_eur, p.source, p.fetched_at],
      )
      if (r.rowCount === 1) pImported++
    }
    await pg.query('COMMIT')
    console.log(`[migrate]   upserted: ${pImported}`)

    // 3. config (encrypted Kraken keys, nonce, etc.)
    // We DON'T copy the encrypted Kraken keys by default — the encryption is
    // scrypt-derived from ENCRYPTION_SECRET, which may differ between local
    // and Vercel environments. Re-enter them in the cloud UI.
    // We DO copy the nonce so Kraken doesn't reject the next request.
    const nonce = sqlite.prepare("SELECT value FROM config WHERE key = 'kraken_last_nonce'").get()
    if (nonce) {
      await pg.query(
        `INSERT INTO config (key, value) VALUES ('kraken_last_nonce', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [nonce.value],
      )
      console.log(`[migrate] config: copied kraken_last_nonce`)
    }
  } finally {
    sqlite.close()
    await pg.end()
  }

  console.log('[migrate] Done.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
