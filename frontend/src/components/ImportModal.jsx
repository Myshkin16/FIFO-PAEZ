import React, { useState, useRef } from 'react'
import { importKraken, importBinance } from '../api/client'

const CARD = { background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: 16 }
const LABEL = { color: '#8b949e', fontSize: 11, textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.5px' }

export default function ImportModal({ onClose, onSuccess }) {
  const [krakenLoading, setKrakenLoading] = useState(false)
  const [krakenResult, setKrakenResult] = useState(null)
  const [krakenError, setKrakenError] = useState(null)

  const [binanceLoading, setBinanceLoading] = useState(false)
  const [binanceResult, setBinanceResult] = useState(null)
  const [binanceError, setBinanceError] = useState(null)
  const [binanceFile, setBinanceFile] = useState(null)

  const fileRef = useRef()

  async function handleKraken() {
    setKrakenLoading(true)
    setKrakenError(null)
    setKrakenResult(null)
    try {
      const data = await importKraken()
      setKrakenResult(data)
      setTimeout(() => { onSuccess(); onClose() }, 1000)
    } catch (err) {
      setKrakenError(err?.response?.data?.error || err.message || 'Error al importar')
    } finally {
      setKrakenLoading(false)
    }
  }

  async function handleBinance() {
    if (!binanceFile) return
    setBinanceLoading(true)
    setBinanceError(null)
    setBinanceResult(null)
    try {
      const data = await importBinance(binanceFile)
      setBinanceResult(data)
      setTimeout(() => { onSuccess(); onClose() }, 1000)
    } catch (err) {
      setBinanceError(err?.response?.data?.error || err.message || 'Error al importar')
    } finally {
      setBinanceLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(13,17,23,0.8)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: 8,
        padding: 24,
        width: 440,
        maxWidth: '92vw',
        position: 'relative',
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 12,
            right: 14,
            background: 'none',
            border: 'none',
            color: '#8b949e',
            fontSize: 20,
            cursor: 'pointer',
            lineHeight: 1,
          }}
          aria-label="Cerrar"
        >
          ×
        </button>

        <h2 style={{ color: '#e6edf3', fontSize: 16, fontWeight: 700, marginBottom: 20, marginTop: 0 }}>
          Importar operaciones
        </h2>

        {/* Kraken section */}
        <div style={{ ...CARD, marginBottom: 16 }}>
          <div style={LABEL}>Importar desde Kraken</div>
          <p style={{ color: '#8b949e', fontSize: 12, margin: '0 0 12px' }}>
            Descarga el historial de trades desde la API de Kraken.
          </p>
          <button
            onClick={handleKraken}
            disabled={krakenLoading}
            style={{
              background: krakenLoading ? '#21262d' : '#0d419d',
              color: krakenLoading ? '#8b949e' : '#58a6ff',
              border: '1px solid #1f6feb',
              borderRadius: 4,
              padding: '6px 16px',
              fontSize: 13,
              cursor: krakenLoading ? 'not-allowed' : 'pointer',
              fontWeight: 600,
            }}
          >
            {krakenLoading ? 'Importando...' : 'Importar desde Kraken'}
          </button>
          {krakenResult && (
            <div style={{ color: '#3fb950', fontSize: 12, marginTop: 8 }}>
              Importadas {krakenResult.count ?? krakenResult.imported ?? '?'} operaciones
            </div>
          )}
          {krakenError && (
            <div style={{ color: '#f85149', fontSize: 12, marginTop: 8 }}>{krakenError}</div>
          )}
        </div>

        {/* Binance section */}
        <div style={CARD}>
          <div style={LABEL}>Importar desde Binance (CSV)</div>
          <p style={{ color: '#8b949e', fontSize: 12, margin: '0 0 12px' }}>
            Exporta tu historial desde Binance y sube el archivo CSV aquí.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={e => setBinanceFile(e.target.files[0] || null)}
              style={{ fontSize: 12, color: '#c9d1d9', flex: 1, minWidth: 0 }}
            />
            <button
              onClick={handleBinance}
              disabled={!binanceFile || binanceLoading}
              style={{
                background: !binanceFile || binanceLoading ? '#21262d' : '#2d1e00',
                color: !binanceFile || binanceLoading ? '#8b949e' : '#f0883e',
                border: '1px solid #f0883e44',
                borderRadius: 4,
                padding: '6px 16px',
                fontSize: 13,
                cursor: !binanceFile || binanceLoading ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {binanceLoading ? 'Importando...' : 'Subir CSV'}
            </button>
          </div>
          {binanceResult && (
            <div style={{ color: '#3fb950', fontSize: 12, marginTop: 8 }}>
              Importadas {binanceResult.count ?? binanceResult.imported ?? '?'} operaciones
            </div>
          )}
          {binanceError && (
            <div style={{ color: '#f85149', fontSize: 12, marginTop: 8 }}>{binanceError}</div>
          )}
        </div>
      </div>
    </div>
  )
}
