import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getClient } from './index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(__dirname, 'migrations')

/**
 * Applies all .sql migrations whose numeric prefix isn't yet recorded in
 * schema_migrations. Uses a TCP Client so each migration file can be a
 * multi-statement DDL block (Postgres parses whole-string `query(sql)` calls
 * as a single command sequence, unlike Neon's HTTP driver which expects
 * exactly one statement per call).
 *
 * Run manually via `npm run db:migrate` — not invoked at request time.
 */
export async function applyMigrations() {
  const client = getClient()
  await client.connect()

  try {
    // Bootstrap the migrations table itself before querying it. DDL is
    // idempotent so this is safe to re-run.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     INTEGER PRIMARY KEY,
        name        TEXT NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const applied = await client.query('SELECT version FROM schema_migrations')
    const appliedVersions = new Set(applied.rows.map(r => Number(r.version)))

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .map(f => {
        const m = f.match(/^(\d+)_/)
        if (!m) throw new Error(`Migration filename must start with digits: ${f}`)
        return { version: Number(m[1]), name: f }
      })
      .sort((a, b) => a.version - b.version)

    const pending = files.filter(f => !appliedVersions.has(f.version))

    for (const { version, name } of pending) {
      const fullSql = fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8')
      // eslint-disable-next-line no-await-in-loop
      await client.query('BEGIN')
      try {
        // eslint-disable-next-line no-await-in-loop
        await client.query(fullSql)
        // eslint-disable-next-line no-await-in-loop
        await client.query(
          'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
          [version, name],
        )
        // eslint-disable-next-line no-await-in-loop
        await client.query('COMMIT')
        console.log(`[db] Applied migration ${name}`)
      } catch (err) {
        // eslint-disable-next-line no-await-in-loop
        await client.query('ROLLBACK')
        throw new Error(`Migration ${name} failed: ${err.message}`)
      }
    }

    return { applied: pending.length, total: files.length }
  } finally {
    await client.end()
  }
}

// CLI entrypoint: `node web/lib/db/migrations.js`
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  applyMigrations()
    .then(r => {
      console.log(`Migrations done. Applied: ${r.applied}/${r.total}.`)
      process.exit(0)
    })
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
}
