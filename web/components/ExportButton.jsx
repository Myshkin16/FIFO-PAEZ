'use client'

import React, { useState } from 'react'
import { exportCsv } from '@/lib/api/client'

export default function ExportButton({ year }) {
  const [loading, setLoading] = useState(false)

  function handleExport() {
    setLoading(true)
    exportCsv(year)
    setTimeout(() => setLoading(false), 800)
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      style={{
        background: loading ? '#21262d' : '#238636',
        color: loading ? '#8b949e' : '#fff',
        border: 'none',
        borderRadius: 6,
        padding: '10px 22px',
        fontSize: 14,
        fontWeight: 700,
        cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s',
      }}
    >
      {loading ? 'Descargando...' : `Descargar CSV ${year}`}
    </button>
  )
}
