import React from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

const CARD = { background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: 16 }
const LABEL = { color: '#8b949e', fontSize: 11, textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.5px' }

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const val = payload[0].value
    const color = val >= 0 ? '#3fb950' : '#f85149'
    return (
      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 4, padding: '6px 10px' }}>
        <div style={{ color: '#8b949e', fontSize: 11 }}>{label}</div>
        <div style={{ color, fontWeight: 700, fontSize: 14 }}>
          {val >= 0 ? '+' : ''}€{Number(val).toFixed(2)}
        </div>
      </div>
    )
  }
  return null
}

export default function GainChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ ...CARD, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#8b949e', fontSize: 13 }}>Sin datos</span>
      </div>
    )
  }

  return (
    <div style={CARD}>
      <div style={LABEL}>Ganancia / Pérdida por año</div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
          <XAxis dataKey="year" tick={{ fill: '#8b949e', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Bar dataKey="gainLoss" radius={[3, 3, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.gainLoss >= 0 ? '#3fb950' : '#f85149'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
