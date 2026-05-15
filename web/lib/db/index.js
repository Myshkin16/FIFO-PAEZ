// Two flavours of Neon access:
//
//   * `sql` (HTTP, tagged template) — what route handlers should use for every
//     normal query. Each call is a single roundtrip over HTTP, no TCP pool to
//     manage, perfectly suited to serverless functions.
//
//   * `getClient()` (TCP/WebSocket Client) — for scripts and rare handlers
//     that need multi-statement transactions or raw multi-statement SQL
//     (migrations, bulk inserts). Caller is responsible for connect()/end().
//
// Both lazily resolve DATABASE_URL so importing this file doesn't blow up at
// build time when the env var isn't set.

import { neon, Client } from '@neondatabase/serverless'

let _sql = null

function dbUrl() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Run `vercel env pull web/.env.local` or set it in your Vercel project.'
    )
  }
  return url
}

function getSql() {
  if (_sql) return _sql
  _sql = neon(dbUrl())
  return _sql
}

// Proxy so `sql\`...\`` works directly without callers having to call getSql().
export const sql = new Proxy(
  function () {},
  {
    apply(_target, _thisArg, args) {
      return getSql().apply(null, args)
    },
    get(_target, prop) {
      return getSql()[prop]
    },
  }
)

export function getClient() {
  return new Client(dbUrl())
}
