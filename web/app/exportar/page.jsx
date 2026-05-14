'use client'

import React, { useContext } from 'react'
import { YearContext } from '@/lib/YearContext'
import ExportButton from '@/components/ExportButton'

const CARD = { background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: 16 }
const MUTED = { color: '#8b949e', fontSize: 13 }

export default function Exportar() {
  const { year } = useContext(YearContext)

  return (
    <div>
      <h1 style={{ color: '#e6edf3', fontSize: 18, fontWeight: 700, marginBottom: 20, marginTop: 0 }}>
        Exportar — {year}
      </h1>

      <div style={{ ...CARD, marginBottom: 16 }}>
        <div style={{ color: '#8b949e', fontSize: 11, textTransform: 'uppercase', marginBottom: 10, letterSpacing: '0.5px' }}>
          ¿Qué contiene el CSV?
        </div>
        <ul style={{ ...MUTED, paddingLeft: 18, lineHeight: 1.8, margin: 0 }}>
          <li>Fecha de venta de cada operación</li>
          <li>Criptomoneda y cantidad vendida</li>
          <li>Coste de adquisición calculado por FIFO (en EUR)</li>
          <li>Precio de venta (en EUR)</li>
          <li>Ganancia o pérdida patrimonial neta</li>
          <li>Exchange de origen (Kraken / Binance)</li>
        </ul>
      </div>

      <div style={{ ...CARD, marginBottom: 16 }}>
        <div style={{ color: '#8b949e', fontSize: 11, textTransform: 'uppercase', marginBottom: 10, letterSpacing: '0.5px' }}>
          Cómo usar este CSV para la declaración IRPF
        </div>
        <p style={MUTED}>
          Este archivo puede importarse directamente en herramientas de asesoría fiscal o usarse
          como justificante para rellenar la casilla <strong style={{ color: '#e6edf3' }}>1626 — Ganancias y pérdidas patrimoniales
          derivadas de monedas virtuales</strong> del modelo 100 de la AEAT.
        </p>
        <p style={{ ...MUTED, marginBottom: 0 }}>
          Los cálculos siguen el método FIFO (primera entrada, primera salida) según la doctrina
          de la Dirección General de Tributos para criptomonedas.
        </p>
      </div>

      <div style={{ ...CARD, marginBottom: 16 }}>
        <div style={{ color: '#8b949e', fontSize: 11, textTransform: 'uppercase', marginBottom: 14, letterSpacing: '0.5px' }}>
          Descargar CSV del ejercicio {year}
        </div>
        <ExportButton year={year} />
      </div>

      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: 12 }}>
        <span style={{ color: '#8b949e', fontSize: 12 }}>
          💡 También puedes descargar años anteriores cambiando el selector de año en la barra de navegación.
        </span>
      </div>
    </div>
  )
}
