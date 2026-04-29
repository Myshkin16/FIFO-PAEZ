import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getKrakenConfig, saveKrakenKeys, deleteKrakenKeys } from '../api/client'
import ImportModal from '../components/ImportModal'

const CARD = { background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: 16 }
const LABEL = { color: '#8b949e', fontSize: 11, textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.5px' }
const MUTED = { color: '#8b949e', fontSize: 13 }

const inputStyle = {
  background: '#0d1117',
  border: '1px solid #30363d',
  borderRadius: 4,
  color: '#e6edf3',
  fontSize: 13,
  padding: '7px 10px',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
}

export default function Config() {
  const queryClient = useQueryClient()
  const [apiKey, setApiKey] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [saveMsg, setSaveMsg] = useState(null)
  const [deleteMsg, setDeleteMsg] = useState(null)
  const [showImport, setShowImport] = useState(false)

  const { data: config, isLoading } = useQuery({
    queryKey: ['kraken-config'],
    queryFn: getKrakenConfig,
  })

  const saveMutation = useMutation({
    mutationFn: () => saveKrakenKeys(apiKey, privateKey),
    onSuccess: () => {
      setSaveMsg('Claves guardadas correctamente')
      setApiKey('')
      setPrivateKey('')
      queryClient.invalidateQueries({ queryKey: ['kraken-config'] })
      setTimeout(() => setSaveMsg(null), 3000)
    },
    onError: (err) => {
      setSaveMsg('Error: ' + (err?.response?.data?.error || err.message))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteKrakenKeys,
    onSuccess: () => {
      setDeleteMsg('Claves eliminadas')
      queryClient.invalidateQueries({ queryKey: ['kraken-config'] })
      setTimeout(() => setDeleteMsg(null), 3000)
    },
    onError: (err) => {
      setDeleteMsg('Error: ' + (err?.response?.data?.error || err.message))
    },
  })

  const isConfigured = config?.configured === true

  return (
    <div>
      <h1 style={{ color: '#e6edf3', fontSize: 18, fontWeight: 700, marginBottom: 20, marginTop: 0 }}>
        Configuración
      </h1>

      {/* Kraken API keys */}
      <div style={{ ...CARD, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ color: '#e6edf3', fontSize: 14, fontWeight: 700 }}>Kraken API</div>
          {isLoading && <span style={MUTED}>Comprobando...</span>}
          {!isLoading && isConfigured && (
            <span style={{
              background: '#1a3c28',
              color: '#3fb950',
              border: '1px solid #3fb95044',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 8px',
            }}>
              ✓ Kraken configurado
            </span>
          )}
          {!isLoading && !isConfigured && (
            <span style={{ color: '#8b949e', fontSize: 12 }}>Sin configurar</span>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
          <div>
            <div style={LABEL}>API Key</div>
            <input
              type="text"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Introduce tu API Key de Kraken"
              style={inputStyle}
              autoComplete="off"
            />
          </div>
          <div>
            <div style={LABEL}>Private Key (Secret)</div>
            <input
              type="password"
              value={privateKey}
              onChange={e => setPrivateKey(e.target.value)}
              placeholder="Introduce tu Private Key"
              style={inputStyle}
              autoComplete="new-password"
            />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!apiKey || !privateKey || saveMutation.isPending}
              style={{
                background: !apiKey || !privateKey || saveMutation.isPending ? '#21262d' : '#238636',
                color: !apiKey || !privateKey || saveMutation.isPending ? '#8b949e' : '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '7px 18px',
                fontSize: 13,
                fontWeight: 700,
                cursor: !apiKey || !privateKey || saveMutation.isPending ? 'not-allowed' : 'pointer',
              }}
            >
              {saveMutation.isPending ? 'Guardando...' : 'Guardar claves'}
            </button>
            {isConfigured && (
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                style={{
                  background: deleteMutation.isPending ? '#21262d' : '#2d1118',
                  color: deleteMutation.isPending ? '#8b949e' : '#f85149',
                  border: '1px solid #f8514944',
                  borderRadius: 6,
                  padding: '7px 18px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: deleteMutation.isPending ? 'not-allowed' : 'pointer',
                }}
              >
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar claves'}
              </button>
            )}
            {isConfigured && (
              <button
                onClick={() => setShowImport(true)}
                style={{
                  background: '#0d419d',
                  color: '#58a6ff',
                  border: '1px solid #1f6feb',
                  borderRadius: 6,
                  padding: '7px 18px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Importar ahora
              </button>
            )}
          </div>
          {saveMsg && (
            <div style={{ color: saveMsg.startsWith('Error') ? '#f85149' : '#3fb950', fontSize: 12 }}>
              {saveMsg}
            </div>
          )}
          {deleteMsg && (
            <div style={{ color: deleteMsg.startsWith('Error') ? '#f85149' : '#3fb950', fontSize: 12 }}>
              {deleteMsg}
            </div>
          )}
        </div>
      </div>

      {/* Binance section */}
      <div style={CARD}>
        <div style={{ color: '#e6edf3', fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Binance (CSV)</div>
        <p style={MUTED}>
          Para importar operaciones de Binance, descarga el historial de transacciones desde tu cuenta Binance
          como archivo CSV y súbelo desde la página de <strong style={{ color: '#e6edf3' }}>Operaciones</strong> o
          usando el botón <strong style={{ color: '#e6edf3' }}>+ Importar</strong> de la barra de navegación.
        </p>
        <p style={{ ...MUTED, marginBottom: 0 }}>
          Binance no requiere configuración de API Key — únicamente el archivo de exportación CSV.
        </p>
      </div>

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['fifo'] })}
        />
      )}
    </div>
  )
}
