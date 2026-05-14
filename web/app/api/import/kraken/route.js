import { NextResponse } from 'next/server'

// Slice 1 mock: no Kraken keys are stored yet (kraken-keys mock returns
// configured:false), so this endpoint should never be hit from the UI.
// Returning a clear 400 makes that visible if it ever is, instead of the
// previous silent 404.
export async function POST() {
  return NextResponse.json(
    { error: 'Kraken not configured. Save API keys in /config first.' },
    { status: 400 },
  )
}
