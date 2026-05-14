import { NextResponse } from 'next/server'

// Slice 1 mock: pretends the CSV upload worked. Returns a deterministic
// response shape matching what the real handler will return in Slice 2,
// so ImportModal's success/skipped detail UI exercises the same code paths.
export async function POST(request) {
  const formData = await request.formData()
  const file = formData.get('file')

  if (!file) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }

  // Inspect the file just enough to give the user a plausible response.
  const sizeKb = Math.round((file.size || 0) / 1024)

  return NextResponse.json({
    imported: 109,
    duplicates: 0,
    skipped: [
      {
        reason: 'mock',
        detail: `This is the Slice 1 mock handler — no rows were actually imported. Received ${file.name || 'file'} (~${sizeKb} KB).`,
      },
    ],
  })
}
