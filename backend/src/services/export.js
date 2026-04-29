'use strict';

const { stringify } = require('csv-stringify/sync');

/**
 * Generates a Spanish IRPF-compatible CSV string from FIFO results.
 *
 * Output columns:
 *   Fecha venta, Crypto, Cantidad vendida, Valor adquisición FIFO (EUR),
 *   Valor transmisión (EUR), Comisiones (EUR), Ganancia/Pérdida (EUR), Exchange
 *
 * @param {import('./fifo').FifoResult[]} fifoResults
 * @returns {string}  CSV string (UTF-8 with BOM for Excel compatibility)
 */
function generateIrpfCsv(fifoResults) {
  const header = [
    'Fecha venta',
    'Crypto',
    'Cantidad vendida',
    'Valor adquisición FIFO (EUR)',
    'Valor transmisión (EUR)',
    'Comisiones (EUR)',
    'Ganancia/Pérdida (EUR)',
    'Exchange',
  ];

  const rows = fifoResults.map(r => [
    formatDate(r.sellDate),
    r.crypto,
    r.amountSold,
    formatEur(r.costBasis),
    formatEur(r.saleProceeds),
    formatEur(r.fees),
    formatEur(r.gainLoss),
    r.source,
  ]);

  const csvBody = stringify([header, ...rows], {
    cast: {
      // Prevent csv-stringify from quoting numbers unnecessarily
      number: (v) => String(v),
    },
  });

  // Prepend UTF-8 BOM so Excel opens accented headers correctly
  return '﻿' + csvBody;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats an ISO 8601 date string as DD/MM/YYYY.
 *
 * @param {string} isoDate
 * @returns {string}
 */
function formatDate(isoDate) {
  const d = new Date(isoDate);
  const dd  = String(d.getUTCDate()).padStart(2, '0');
  const mm  = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Formats a number to 2 decimal places as a string.
 *
 * @param {number} n
 * @returns {string}
 */
function formatEur(n) {
  return (typeof n === 'number' ? n : 0).toFixed(2);
}

module.exports = { generateIrpfCsv };
