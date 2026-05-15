import { sql } from '@/lib/db'
import { calculateFifo } from '@/lib/fifo'
import { generateIrpfCsv } from '@/lib/export'

export const runtime = 'nodejs'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const yearParam = searchParams.get('year')

  if (!yearParam || !/^\d{4}$/.test(yearParam)) {
    return new Response('year query param is required (4-digit number)', { status: 400 })
  }
  const year = parseInt(yearParam, 10)

  const transactions = await sql`SELECT * FROM transactions ORDER BY date ASC`
  const normalized = transactions.map(t => ({
    ...t,
    date: t.date instanceof Date ? t.date.toISOString() : t.date,
    amount: Number(t.amount),
    price_eur: Number(t.price_eur),
    total_eur: Number(t.total_eur),
    fee_eur: Number(t.fee_eur),
  }))

  const allResults = calculateFifo(normalized)
  const results = allResults.filter(r => r.year === year)
  const csv = generateIrpfCsv(results)

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="fifo-irpf-${year}.csv"`,
    },
  })
}
