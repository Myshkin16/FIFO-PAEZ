import React, { useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import { YearContext } from '../App'
import { getFifo } from '../api/client'
import CryptoBreakdown from '../components/CryptoBreakdown'

const CARD = { background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: 16 }
const LABEL = { color: '#8b949e', fontSize: 11, textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.5px' }
const MUTED = { color: '#8b949e', fontSize: 12 }

function buildCryptoStats(results) {
  const map = {}
  for (const r of results) {
    const key = r.crypto || r.asset || 'UNKNOWN'
    if (!map[key]) {
      map[key] = { trades: 0, gainLoss: 0, biggestGain: null, biggestLoss: null }
    }
    const gl = Number(r.gainLoss) || 0
    map[key].trades += 1
    map[key].gainLoss += gl
    if (gl > 0 && (map[key].biggestGain === null || gl > map[key].biggestGain)) {
      map[key].biggestGain = gl
    }
    if (gl < 0 && (map[key].biggestLoss === null || gl < map[key].biggestLoss)) {
      map[key].biggestLoss = gl
    }
  }
  return Object.entries(map)
    .sort((a, b) => Math.abs(b[1].gainLoss) - Math.abs(a[1].gainLoss))
}

export default function PorCrypto() {
  const { year } = useContext(YearContext)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['fifo', year],
    queryFn: () => getFifo(year),
  })

  const results = data?.results || []
  const cryptoStats = buildCryptoStats(results)

  return (
    <div>
      <h1 style={{ color: '#e6edf3', fontSize: 18, fontWeight: 700, marginBottom: 20, marginTop: 0 }}>
        Por Crypto — {year}
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
        <>
          {/* Breakdown bar chart — no limit */}
          <div style={{ marginBottom: 20 }}>
            <CryptoBreakdown results={results} limit={0} />
          </div>

          {/* Per-crypto detail cards */}
          {cryptoStats.length === 0 && (
            <div style={{ color: '#8b949e', fontSize: 13 }}>Sin operaciones para este año.</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {cryptoStats.map(([crypto, stats]) => {
              const isPositive = stats.gainLoss >= 0
              return (
                <div key={crypto} style={CARD}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ color: '#e6edf3', fontSize: 15, fontWeight: 700 }}>{crypto}</span>
                    <span style={{
                      color: isPositive ? '#3fb950' : '#f85149',
                      fontWeight: 700,
                      fontSize: 14,
                    }}>
                      {isPositive ? '+' : ''}€{stats.gainLoss.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <div style={LABEL}>Trades</div>
                      <div style={{ color: '#58a6ff', fontSize: 16, fontWeight: 700 }}>{stats.trades}</div>
                    </div>
                    <div>
                      <div style={LABEL}>G/P neto</div>
                      <div style={{ color: isPositive ? '#3fb950' : '#f85149', fontSize: 14, fontWeight: 600 }}>
                        {isPositive ? '+' : ''}€{stats.gainLoss.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div style={LABEL}>Mayor ganancia</div>
                      <div style={{ color: '#3fb950', fontSize: 13 }}>
                        {stats.biggestGain != null ? `+€${stats.biggestGain.toFixed(2)}` : <span style={MUTED}>—</span>}
                      </div>
                    </div>
                    <div>
                      <div style={LABEL}>Mayor pérdida</div>
                      <div style={{ color: '#f85149', fontSize: 13 }}>
                        {stats.biggestLoss != null ? `-€${Math.abs(stats.biggestLoss).toFixed(2)}` : <span style={MUTED}>—</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
