import { stringify } from 'csv-stringify/sync'

export function generateIrpfCsv(fifoResults) {
  if (!Array.isArray(fifoResults)) {
    throw new TypeError('generateIrpfCsv expects an array of FIFO results')
  }

  const header = [
    'Fecha venta', 'Crypto', 'Cantidad vendida',
    'Valor adquisición FIFO (EUR)', 'Valor transmisión (EUR)',
    'Comisiones (EUR)', 'Ganancia/Pérdida (EUR)', 'Exchange',
  ]

  const rows = fifoResults.map(r => [
    formatDate(r.sellDate),
    r.crypto,
    r.amountSold,
    formatEur(r.costBasis),
    formatEur(r.saleProceeds),
    formatEur(r.fees),
    formatEur(r.gainLoss),
    r.source,
  ])

  const csvBody = stringify([header, ...rows], {
    cast: { number: (v) => String(v) },
  })
  // UTF-8 BOM for Excel
  return '﻿' + csvBody
}

function formatDate(isoDate) {
  const d = new Date(isoDate)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = d.getUTCFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function formatEur(n) {
  return (typeof n === 'number' ? n : 0).toFixed(2)
}
