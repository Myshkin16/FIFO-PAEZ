import React, { useState, useEffect, useRef } from 'react'
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Resumen from './pages/Resumen'
import Operaciones from './pages/Operaciones'
import PorCrypto from './pages/PorCrypto'
import Exportar from './pages/Exportar'
import Config from './pages/Config'
import { getFifoSummary } from './api/client'

const NAV_LINKS = [
  { to: '/', label: 'Resumen', end: true },
  { to: '/operaciones', label: 'Operaciones' },
  { to: '/por-crypto', label: 'Por Crypto' },
  { to: '/exportar', label: 'Exportar' },
  { to: '/config', label: '⚙ Config' },
]

const styles = {
  navbar: {
    background: '#161b22',
    borderBottom: '1px solid #30363d',
    padding: '0 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 0,
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  logo: {
    color: '#e94560',
    fontWeight: 'bold',
    fontSize: 15,
    padding: '12px 16px 12px 0',
    marginRight: 8,
    borderRight: '1px solid #30363d',
    whiteSpace: 'nowrap',
  },
  navLinks: { display: 'flex' },
  main: { padding: '24px 20px', maxWidth: 1100, margin: '0 auto' },
  yearSelector: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  select: {
    background: '#21262d',
    color: '#c9d1d9',
    border: '1px solid #30363d',
    borderRadius: 4,
    padding: '4px 8px',
    fontSize: 12,
    cursor: 'pointer',
  },
  importBtn: {
    background: '#238636',
    color: '#fff',
    fontSize: 12,
    padding: '4px 14px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
  },
}

const navLinkStyle = ({ isActive }) => ({
  color: isActive ? '#e6edf3' : '#8b949e',
  fontSize: 13,
  padding: '12px 16px',
  textDecoration: 'none',
  borderBottom: isActive ? '2px solid #e94560' : '2px solid transparent',
  display: 'block',
})

const currentYear = new Date().getFullYear()
const DEFAULT_YEARS = Array.from({ length: 6 }, (_, i) => currentYear - i)

export const YearContext = React.createContext({ year: currentYear, setYear: () => {} })

export default function App() {
  const [year, setYear] = useState(currentYear)
  const userPickedYear = useRef(false)
  const navigate = useNavigate()

  // Pulls the per-year FIFO summary so we can default the selector to the
  // most recent year that actually has operations. Without this, a fresh
  // import of older data lands on a year with no records and looks empty.
  const summaryQuery = useQuery({
    queryKey: ['fifo-summary'],
    queryFn: getFifoSummary,
  })

  const dataYears = (summaryQuery.data?.years || []).map(y => Number(y.year))

  useEffect(() => {
    if (dataYears.length === 0) return
    if (userPickedYear.current) return
    if (dataYears.includes(year)) return
    setYear(Math.max(...dataYears))
  }, [dataYears.join(',')])

  const yearOptions = Array.from(new Set([...DEFAULT_YEARS, ...dataYears]))
    .sort((a, b) => b - a)

  const handleYearChange = (next) => {
    userPickedYear.current = true
    setYear(next)
  }

  return (
    <YearContext.Provider value={{ year, setYear: handleYearChange }}>
      <nav style={styles.navbar}>
        <div style={styles.logo}>₿ FIFO IRPF</div>
        <div style={styles.navLinks}>
          {NAV_LINKS.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} style={navLinkStyle}>{label}</NavLink>
          ))}
        </div>
        <div style={styles.yearSelector}>
          <select
            style={styles.select}
            value={year}
            onChange={e => handleYearChange(Number(e.target.value))}
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button style={styles.importBtn} onClick={() => navigate('/config')}>
            + Importar
          </button>
        </div>
      </nav>
      <main style={styles.main}>
        <Routes>
          <Route path="/" element={<Resumen />} />
          <Route path="/operaciones" element={<Operaciones />} />
          <Route path="/por-crypto" element={<PorCrypto />} />
          <Route path="/exportar" element={<Exportar />} />
          <Route path="/config" element={<Config />} />
        </Routes>
      </main>
    </YearContext.Provider>
  )
}
