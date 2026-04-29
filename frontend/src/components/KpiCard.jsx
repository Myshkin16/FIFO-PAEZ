import React from 'react'

const CARD = { background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: 16 }
const LABEL = { color: '#8b949e', fontSize: 11, textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.5px' }
const MUTED = { color: '#8b949e', fontSize: 12 }

export default function KpiCard({ label, value, subtext, color }) {
  const valueColor = color || '#e6edf3'
  return (
    <div style={CARD}>
      <div style={LABEL}>{label}</div>
      <div style={{ color: valueColor, fontSize: 26, fontWeight: 700, lineHeight: 1.2, marginBottom: 4 }}>
        {value}
      </div>
      {subtext && <div style={MUTED}>{subtext}</div>}
    </div>
  )
}
