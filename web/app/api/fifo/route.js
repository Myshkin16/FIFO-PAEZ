import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { calculateFifo, calcTaxEstimate } from '@/lib/fifo'

export const runtime = 'nodejs'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const yearParam = searchParams.get('year')

  if (!yearParam || !/^\d{4}$/.test(yearParam)) {
    return NextResponse.json(
      { error: 'year query param is required (4-digit number)' },
      { status: 400 },
    )
  }
  const year = parseInt(yearParam, 10)

  const transactions = await sql`SELECT * FROM transactions ORDER BY date ASC`
  // Postgres returns DOUBLE PRECISION as a string and TIMESTAMPTZ as a Date.
  // Normalize once so the FIFO engine stays I/O-free and number-typed.
  const normalized = transactions.map(t => ({
    ...t,
    date: t.date instanceof Date ? t.date.toISOString() : t.date,
    amount:    Number(t.amount),
    price_eur: Number(t.price_eur),
    total_eur: Number(t.total_eur),
    fee_eur:   Number(t.fee_eur),
  }))

  const allResults = calculateFifo(normalized)
  const results = allResults.filter(r => r.year === year)
  const gainLoss = results.reduce((s, r) => s + r.gainLoss, 0)
  const taxEstimate = calcTaxEstimate(gainLoss)
  const warningsCount = results.filter(r => r.warning).length

  return NextResponse.json({
    year,
    results,
    totals: {
      gainLoss: Math.round(gainLoss * 100) / 100,
      taxEstimate,
      warningsCount,
    },
  })
}
