import React from 'react'

const CARD = { background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: 16 }
const LABEL = { color: '#8b949e', fontSize: 11, textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.5px' }
const MUTED = { color: '#8b949e', fontSize: 12 }

export default function CryptoBreakdown({ results, limit = 8 }) {
  if (!results || results.length === 0) {
    return (
      <div style={CARD}>
        <div style={LABEL}>Por Crypto</div>
        <div style={MUTED}>Sin datos</div>
      </div>
    )
  }

  const map = {}
  for (const r of results) {
    const key = r.crypto || r.asset || 'UNKNOWN'
    if (!map[key]) map[key] = 0
    map[key] += Number(r.gainLoss) || 0
  }

  let entries = Object.entries(map).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  if (limit && limit > 0) entries = entries.slice(0, limit)

  const maxAbs = entries.length > 0 ? Math.abs(entries[0][1]) : 1

  return (
    <div style={CARD}>
      <div style={LABEL}>Por Crypto</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {entries.map(([crypto, gainLoss]) => {
          const pct = maxAbs > 0 ? (Math.abs(gainLoss) / maxAbs) * 100 : 0
          const isPositive = gainLoss >= 0
          const barColor = isPositive ? '#3fb950' : '#f85149'
          const textColor = isPositive ? '#3fb950' : '#f85149'

          return (
            <div key={crypto}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#e6edf3', fontSize: 13, fontWeight: 600 }}>{crypto}</span>
                <span style={{ color: textColor, fontSize: 13, fontWeight: 700 }}>
                  {isPositive ? '+' : ''}€{gainLoss.toFixed(2)}
                </span>
              </div>
              <div style={{ background: '#21262d', borderRadius: 2, height: 6, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: barColor,
                    borderRadius: 2,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
