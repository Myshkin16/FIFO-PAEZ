'use client'

import React from 'react'
import { useRouter } from 'next/navigation'

function formatDate(dateStr) {
  const s = dateStr ? dateStr.slice(0, 10) : ''
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

function ExchangeBadge({ exchange }) {
  const isKraken = exchange && exchange.toLowerCase() === 'kraken'
  const isBinance = exchange && exchange.toLowerCase() === 'binance'
  const bg = isKraken ? '#1c2d3f' : isBinance ? '#2d2200' : '#21262d'
  const color = isKraken ? '#58a6ff' : isBinance ? '#f0883e' : '#8b949e'
  return (
    <span style={{
      background: bg,
      color,
      fontSize: 11,
      fontWeight: 600,
      padding: '2px 7px',
      borderRadius: 4,
      border: `1px solid ${color}33`,
    }}>
      {exchange || '?'}
    </span>
  )
}

const thStyle = {
  color: '#8b949e',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  padding: '8px 10px',
  borderBottom: '1px solid #30363d',
  textAlign: 'left',
  fontWeight: 600,
  whiteSpace: 'nowrap',
}

export default function TradesTable({ results, limit }) {
  const router = useRouter()

  if (!results || results.length === 0) {
    return <div style={{ color: '#8b949e', fontSize: 13, padding: '16px 0' }}>Sin operaciones para este año.</div>
  }

  const rows = limit ? results.slice(0, limit) : results
  const hasMore = limit && results.length > limit

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 28 }} aria-label="Aviso"></th>
              <th style={thStyle}>Fecha</th>
              <th style={thStyle}>Crypto</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Cantidad</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Coste FIFO</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Precio venta</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>G/P EUR</th>
              <th style={thStyle}>Exchange</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const gainLoss = Number(r.gainLoss) || 0
              const isPositive = gainLoss >= 0
              const rowBg = i % 2 === 0 ? '#161b22' : '#0d1117'
              return (
                <tr key={r.id || i} style={{ background: rowBg }}>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                    {r.warning && (
                      <span
                        title={r.warning}
                        aria-label={`Aviso: ${r.warning}`}
                        style={{ color: '#d29922', fontSize: 14, cursor: 'help' }}
                      >
                        ⚠
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '8px 10px', color: '#c9d1d9', whiteSpace: 'nowrap' }}>
                    {formatDate(r.sellDate || r.date)}
                  </td>
                  <td style={{ padding: '8px 10px', color: '#e6edf3', fontWeight: 600 }}>
                    {r.crypto || r.asset || '-'}
                  </td>
                  <td style={{ padding: '8px 10px', color: '#c9d1d9', textAlign: 'right' }}>
                    {Number(r.amountSold || r.amount || r.quantity || 0).toFixed(6)}
                  </td>
                  <td style={{ padding: '8px 10px', color: '#c9d1d9', textAlign: 'right' }}>
                    €{Number(r.costBasis || r.fifoCost || 0).toFixed(2)}
                  </td>
                  <td style={{ padding: '8px 10px', color: '#c9d1d9', textAlign: 'right' }}>
                    €{Number(r.saleProceeds || r.salePrice || r.sellPrice || 0).toFixed(2)}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: isPositive ? '#3fb950' : '#f85149' }}>
                    {isPositive ? '+' : ''}€{gainLoss.toFixed(2)}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <ExchangeBadge exchange={r.source || r.exchange} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div style={{ textAlign: 'right', marginTop: 10 }}>
          <button
            onClick={() => router.push('/operaciones')}
            style={{
              background: 'none',
              border: 'none',
              color: '#58a6ff',
              fontSize: 13,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Ver todas ({results.length}) →
          </button>
        </div>
      )}
    </div>
  )
}
