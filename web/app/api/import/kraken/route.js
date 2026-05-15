import { NextResponse } from 'next/server'
import { sql, getClient } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { fetchKrakenHistory } from '@/lib/kraken'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST() {
  const rows = await sql`
    SELECT key, value FROM config
    WHERE key IN ('kraken_api_key', 'kraken_private_key')
  `
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]))
  if (!map.kraken_api_key || !map.kraken_private_key) {
    return NextResponse.json({ error: 'Kraken API keys not configured' }, { status: 400 })
  }

  let apiKey, privateKey
  try {
    apiKey = decrypt(map.kraken_api_key)
    privateKey = decrypt(map.kraken_private_key)
  } catch (err) {
    return NextResponse.json(
      { error: 'Could not decrypt Kraken keys (check ENCRYPTION_SECRET)' },
      { status: 500 },
    )
  }

  let transactions, skipped
  try {
    const result = await fetchKrakenHistory(apiKey, privateKey)
    transactions = result.transactions
    skipped = result.skipped
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 })
  }

  const { imported, duplicates } = await bulkInsert(transactions)
  return NextResponse.json({ imported, duplicates, skipped })
}

async function bulkInsert(txs) {
  if (txs.length === 0) return { imported: 0, duplicates: 0 }
  const client = getClient()
  await client.connect()
  let imported = 0, duplicates = 0
  try {
    await client.query('BEGIN')
    for (const tx of txs) {
      const result = await client.query(
        `INSERT INTO transactions
          (id, source, type, crypto, amount, price_eur, total_eur, fee_eur, date, raw_pair)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING`,
        [tx.id, tx.source, tx.type, tx.crypto, tx.amount,
         tx.price_eur, tx.total_eur, tx.fee_eur, tx.date, tx.raw_pair || null],
      )
      if (result.rowCount === 1) imported++
      else duplicates++
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    await client.end()
  }
  return { imported, duplicates }
}
