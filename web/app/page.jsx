'use client'

import React, { useContext, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { YearContext } from '@/lib/YearContext'
import { getFifo, getFifoSummary } from '@/lib/api/client'
import KpiCard from '@/components/KpiCard'
import GainChart from '@/components/GainChart'
import CryptoBreakdown from '@/components/CryptoBreakdown'
import TradesTable from '@/components/TradesTable'
import ImportModal from '@/components/ImportModal'

const CARD = { background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: 16 }

function fmt(value) {
  const n = Number(value) || 0
  const abs = Math.abs(n).toFixed(2)
  return (n >= 0 ? '+' : '-') + '€' + abs
}

export default function Resumen() {
  const { year } = useContext(YearContext)
  const [showImport, setShowImport] = useState(false)

  const fifoQuery = useQuery({
    queryKey: ['fifo', year],
    queryFn: () => getFifo(year),
  })

  const summaryQuery = useQuery({
    queryKey: ['fifo-summary'],
    queryFn: getFifoSummary,
  })

  if (fifoQuery.isLoading || summaryQuery.isLoading) {
    return <div style={{ color: '#8b949e', padding: '40px 0' }}>Cargando...</div>
  }

  if (fifoQuery.isError || summaryQuery.isError) {
    return <div style={{ color: '#f85149' }}>Error al cargar los datos. ¿Está corriendo el backend?</div>
  }

  const fifoData = fifoQuery.data || {}
  const results = fifoData.results || []
  const totals = fifoData.totals || {}

  const gainLoss = Number(totals.gainLoss) || 0
  const taxEstimate = Number(totals.taxEstimate) || 0
  const warningsCount = Number(totals.warningsCount) || 0
  const losses = results.reduce((acc, r) => {
    const g = Number(r.gainLoss) || 0
    return g < 0 ? acc + g : acc
  }, 0)

  const summaryData = summaryQuery.data || {}
  const chartData = (summaryData.years || []).map(item => ({
    year: String(item.year),
    gainLoss: Number(item.gainLoss) || 0,
  }))

  const isGainPositive = gainLoss >= 0

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ color: '#e6edf3', fontSize: 18, fontWeight: 700, margin: 0 }}>
          Resumen {year}
        </h1>
        <button
          onClick={() => setShowImport(true)}
          style={{
            background: '#238636',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '7px 16px',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          + Importar
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: warningsCount > 0 ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        <KpiCard
          label="Ganancia neta"
          value={fmt(gainLoss)}
          subtext={`Año ${year}`}
          color={isGainPositive ? '#3fb950' : '#f85149'}
        />
        <KpiCard
          label="Impuesto estimado"
          value={`€${taxEstimate.toFixed(2)}`}
          subtext="IRPF estimado"
          color="#f0883e"
        />
        <KpiCard
          label="Nº operaciones"
          value={results.length}
          subtext="operaciones FIFO"
          color="#58a6ff"
        />
        <KpiCard
          label="Pérdidas compensables"
          value={losses < 0 ? `-€${Math.abs(losses).toFixed(2)}` : '€0.00'}
          subtext="suma de pérdidas"
          color="#f85149"
        />
        {warningsCount > 0 && (
          <KpiCard
            label="Avisos"
            value={warningsCount}
            subtext="operaciones con aviso"
            color="#d29922"
          />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <GainChart data={chartData} />
        <CryptoBreakdown results={results} limit={8} />
      </div>

      <div style={CARD}>
        <div style={{ color: '#8b949e', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
          Últimas operaciones
        </div>
        <TradesTable results={results} limit={5} />
      </div>

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            fifoQuery.refetch()
            summaryQuery.refetch()
          }}
        />
      )}
    </div>
  )
}
