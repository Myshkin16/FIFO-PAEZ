import { NextResponse } from 'next/server'

// Slice 1 mock: pretend nothing is configured yet so the Config page renders
// the "Sin configurar" state. Slice 2 replaces this with real Postgres+crypto.
export async function GET() {
  return NextResponse.json({ configured: false })
}

export async function POST() {
  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  return NextResponse.json({ ok: true })
}
