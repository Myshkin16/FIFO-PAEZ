import { NextResponse } from 'next/server'
import { getClient } from '@/lib/db'
import { parseBinanceCsv } from '@/lib/binance'

export const runtime = 'nodejs'
// Imports can take up to ~30s while warming the price cache. 60s is the
// default for Pro projects; Hobby tops out at 10s and will need a different
// approach (Workflow/batching) before going prod on free tier.
export const maxDuration = 60

export async function POST(request) {
  const formData = await request.formData().catch(() => null)
  const file = formData?.get('file')

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 413 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  let transactions, skipped
  try {
    const result = await parseBinanceCsv(buffer)
    transactions = result.transactions
    skipped = result.skipped
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }

  const { imported, duplicates } = await bulkInsert(transactions)
  return NextResponse.json({ imported, duplicates, skipped })
}

async function bulkInsert(txs) {
  if (txs.length === 0) return { imported: 0, duplicates: 0 }

  const client = getClient()
  await client.connect()
  let imported = 0
  let duplicates = 0

  try {
    await client.query('BEGIN')
    for (const tx of txs) {
      const result = await client.query(
        `INSERT INTO transactions
          (id, source, type, crypto, amount, price_eur, total_eur, fee_eur, date, raw_pair)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING`,
        [
          tx.id, tx.source, tx.type, tx.crypto, tx.amount,
          tx.price_eur, tx.total_eur, tx.fee_eur, tx.date, tx.raw_pair || null,
        ],
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
