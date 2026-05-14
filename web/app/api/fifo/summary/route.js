import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    years: [
      { year: 2025, gainLoss: -489.66, taxEstimate: 0, operationsCount: 56, warningsCount: 7 },
    ],
  })
}
