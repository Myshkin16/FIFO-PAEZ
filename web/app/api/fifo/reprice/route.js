import { NextResponse } from 'next/server'

// Slice 1 mock: matches the shape of the real /reprice endpoint
// ({ updated, unchanged, skippedNoPrice, totalRows }) so the Config page
// renders the result string correctly. All zeros because there are no
// real rows to reprice yet.
export async function POST() {
  return NextResponse.json({
    updated: 0,
    unchanged: 0,
    skippedNoPrice: 0,
    totalRows: 0,
  })
}
