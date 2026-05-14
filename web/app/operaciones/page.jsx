'use client'

import React, { useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import { YearContext } from '@/lib/YearContext'
import { getFifo } from '@/lib/api/client'
import TradesTable from '@/components/TradesTable'

const CARD = { background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: 16 }

export default function Operaciones() {
  const { year } = useContext(YearContext)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['fifo', year],
    queryFn: () => getFifo(year),
  })

  const results = data?.results || []

  return (
    <div>
      <h1 style={{ color: '#e6edf3', fontSize: 18, fontWeight: 700, marginBottom: 20, marginTop: 0 }}>
        Operaciones {year}
      </h1>

      {isLoading && (
        <div style={{ color: '#8b949e', padding: '40px 0' }}>Cargando...</div>
      )}

      {isError && (
        <div style={{ color: '#f85149', padding: '16px', background: '#21262d', borderRadius: 6, marginBottom: 16 }}>
          Error: {error?.message || 'No se pudo cargar los datos'}
        </div>
      )}

      {!isLoading && !isError && (
        <div style={CARD}>
          <div style={{ color: '#8b949e', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
            {results.length} operaciones
          </div>
          <TradesTable results={results} />
        </div>
      )}
    </div>
  )
}
