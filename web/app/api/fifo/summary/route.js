import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { calculateFifo, calcTaxEstimate } from '@/lib/fifo'

export const runtime = 'nodejs'

export async function GET() {
  const transactions = await sql`SELECT * FROM transactions ORDER BY date ASC`
  const normalized = transactions.map(t => ({
    ...t,
    date: t.date instanceof Date ? t.date.toISOString() : t.date,
    amount:    Number(t.amount),
    price_eur: Number(t.price_eur),
    total_eur: Number(t.total_eur),
    fee_eur:   Number(t.fee_eur),
  }))

  const allResults = calculateFifo(normalized)

  const byYear = new Map()
  for (const r of allResults) {
    if (!byYear.has(r.year)) byYear.set(r.year, { gainLoss: 0, count: 0, warningsCount: 0 })
    const e = byYear.get(r.year)
    e.gainLoss += r.gainLoss
    e.count++
    if (r.warning) e.warningsCount++
  }

  const years = Array.from(byYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, data]) => {
      const gainLoss = Math.round(data.gainLoss * 100) / 100
      return {
        year,
        gainLoss,
        taxEstimate: calcTaxEstimate(gainLoss),
        operationsCount: data.count,
        warningsCount: data.warningsCount,
      }
    })

  return NextResponse.json({ years })
}
