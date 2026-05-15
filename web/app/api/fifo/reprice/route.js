import { NextResponse } from 'next/server'
import { sql, getClient } from '@/lib/db'

export const runtime = 'nodejs'

// Recompute price_eur and total_eur for every transaction from the current
// price_cache (skipping rows with source='failed'). Idempotent and quiet —
// rows already within 1 cent of the cached price stay untouched.
//
// Uses a TCP Client so the whole reprice runs in a single transaction. With
// ~100 rows this is fine inside Vercel's 60s function timeout.
export async function POST() {
  const client = getClient()
  await client.connect()

  try {
    await client.query('BEGIN')

    const { rows: txs } = await client.query(
      'SELECT id, crypto, amount, date, price_eur, total_eur FROM transactions'
    )

    let updated = 0
    let unchanged = 0
    let skippedNoPrice = 0

    for (const tx of txs) {
      const dateStr = tx.date instanceof Date
        ? tx.date.toISOString().slice(0, 10)
        : String(tx.date).slice(0, 10)

      const { rows: priceRows } = await client.query(
        'SELECT price_eur, source FROM price_cache WHERE crypto = $1 AND date = $2',
        [tx.crypto, dateStr],
      )
      const row = priceRows[0]
      if (!row || Number(row.price_eur) <= 0 || row.source === 'failed') {
        skippedNoPrice++
        continue
      }
      const newPrice = Number(row.price_eur)
      const newTotal = Number(tx.amount) * newPrice
      if (Math.abs(Number(tx.total_eur) - newTotal) < 0.01) {
        unchanged++
        continue
      }
      await client.query(
        'UPDATE transactions SET price_eur = $1, total_eur = $2 WHERE id = $3',
        [newPrice, newTotal, tx.id],
      )
      updated++
    }

    await client.query('COMMIT')
    return NextResponse.json({ updated, unchanged, skippedNoPrice, totalRows: txs.length })
  } catch (err) {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: err.message }, { status: 500 })
  } finally {
    await client.end()
  }
}
