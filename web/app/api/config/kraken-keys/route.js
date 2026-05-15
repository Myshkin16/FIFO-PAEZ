import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { encrypt } from '@/lib/crypto'

export const runtime = 'nodejs'

export async function GET() {
  const rows = await sql`
    SELECT key FROM config
    WHERE key IN ('kraken_api_key', 'kraken_private_key')
  `
  return NextResponse.json({ configured: rows.length === 2 })
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}))
  const { apiKey, privateKey } = body || {}

  if (!apiKey || !privateKey || typeof apiKey !== 'string' || typeof privateKey !== 'string') {
    return NextResponse.json(
      { error: 'Both apiKey and privateKey are required (non-empty strings)' },
      { status: 400 },
    )
  }

  const encApi = encrypt(apiKey)
  const encPriv = encrypt(privateKey)

  // Two atomic upserts. Wrap in a single sql.transaction so a failure on the
  // second row doesn't leave the first half-written.
  await sql.transaction([
    sql`INSERT INTO config (key, value) VALUES ('kraken_api_key', ${encApi})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    sql`INSERT INTO config (key, value) VALUES ('kraken_private_key', ${encPriv})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  ])

  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  await sql`DELETE FROM config WHERE key IN ('kraken_api_key', 'kraken_private_key')`
  return NextResponse.json({ ok: true })
}
