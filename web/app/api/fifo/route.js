import { NextResponse } from 'next/server'

// Slice 1 mock: returns realistic-looking fixture data so the UI can render
// in dev before the real DB + FIFO engine are wired up in Slice 2.
const MOCK_RESULTS = [
  { sellDate: '2025-04-08T12:00:00.000Z', crypto: 'BTC', amountSold: 0.0123, costBasis: 950.12, saleProceeds: 854.61, fees: 1.20, gainLoss: -96.71, year: 2025, source: 'binance' },
  { sellDate: '2025-03-25T14:30:00.000Z', crypto: 'ETH', amountSold: 0.5, costBasis: 1100.00, saleProceeds: 957.83, fees: 0.80, gainLoss: -142.97, year: 2025, source: 'binance' },
  { sellDate: '2025-03-12T09:15:00.000Z', crypto: 'ADA', amountSold: 1000, costBasis: 850.00, saleProceeds: 676.30, fees: 0.50, gainLoss: -174.20, year: 2025, source: 'binance' },
  { sellDate: '2025-02-28T11:14:00.000Z', crypto: 'USDT', amountSold: 105.14, costBasis: 0, saleProceeds: 101.27, fees: 0, gainLoss: 101.27, year: 2025, source: 'binance',
    warning: 'Insufficient buy inventory: 105.14012979 USDT unmatched — cost basis may be understated' },
  { sellDate: '2025-11-19T18:00:00.000Z', crypto: 'XRP', amountSold: 200, costBasis: 380.00, saleProceeds: 365.38, fees: 0.30, gainLoss: -14.92, year: 2025, source: 'binance' },
]

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year'), 10)
  if (!year) {
    return NextResponse.json({ error: 'year query param is required' }, { status: 400 })
  }
  const results = MOCK_RESULTS.filter(r => r.year === year)
  const gainLoss = results.reduce((sum, r) => sum + r.gainLoss, 0)
  return NextResponse.json({
    year,
    results,
    totals: {
      gainLoss: Math.round(gainLoss * 100) / 100,
      taxEstimate: 0,
      warningsCount: results.filter(r => r.warning).length,
    },
  })
}
