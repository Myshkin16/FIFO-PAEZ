import React, { useState } from 'react'
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import Resumen from './pages/Resumen'
import Operaciones from './pages/Operaciones'
import PorCrypto from './pages/PorCrypto'
import Exportar from './pages/Exportar'
import Config from './pages/Config'

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

const YEARS = [2025, 2024, 2023, 2022, 2021]

export const YearContext = React.createContext(new Date().getFullYear())

export default function App() {
  const [year, setYear] = useState(new Date().getFullYear())
  const navigate = useNavigate()

  return (
    <YearContext.Provider value={year}>
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
            onChange={e => setYear(Number(e.target.value))}
          >
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
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
