// Slice 1 mock: returns a tiny placeholder CSV so the browser's "Save As"
// dialog fires and the user can see the export flow works end-to-end.
// Slice 2 wires this to the real FIFO calculator.

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year') || new Date().getFullYear()

  const csv = [
    'fecha,crypto,cantidad,coste_eur,venta_eur,gain_loss_eur,exchange',
    '# Slice 1 mock — replace with real handler in Slice 2',
    `# Year requested: ${year}`,
  ].join('\n')

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="fifo-irpf-${year}.csv"`,
    },
  })
}
