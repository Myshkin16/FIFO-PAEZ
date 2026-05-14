'use client'

import React, { useEffect, useRef, useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { YearContext } from '@/lib/YearContext'
import { getFifoSummary } from '@/lib/api/client'

const NAV_LINKS = [
  { href: '/', label: 'Resumen' },
  { href: '/operaciones', label: 'Operaciones' },
  { href: '/por-crypto', label: 'Por Crypto' },
  { href: '/exportar', label: 'Exportar' },
  { href: '/config', label: '⚙ Config' },
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
  yearSelector: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 },
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

const currentYear = new Date().getFullYear()
const DEFAULT_YEARS = Array.from({ length: 6 }, (_, i) => currentYear - i)

function navLinkStyle(active) {
  return {
    color: active ? '#e6edf3' : '#8b949e',
    fontSize: 13,
    padding: '12px 16px',
    textDecoration: 'none',
    borderBottom: active ? '2px solid #e94560' : '2px solid transparent',
    display: 'block',
  }
}

export default function AppShell({ children }) {
  // QueryClient is created lazily per component instance so we don't reuse
  // the same cache across server-side renders. The function form of useState
  // ensures we only create one client per mount.
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      <Shell>{children}</Shell>
    </QueryClientProvider>
  )
}

// We need a separate component so the navbar's useQuery hook lives INSIDE the
// QueryClientProvider. Doing it in AppShell directly would put the hook above
// the provider.
function Shell({ children }) {
  const pathname = usePathname()
  const router = useRouter()
  const [year, setYear] = useState(currentYear)
  const userPickedYear = useRef(false)

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataYears.join(',')])

  const yearOptions = Array.from(new Set([...DEFAULT_YEARS, ...dataYears]))
    .sort((a, b) => b - a)

  function handleYearChange(next) {
    userPickedYear.current = true
    setYear(next)
  }

  return (
    <YearContext.Provider value={{ year, setYear: handleYearChange }}>
      <nav style={styles.navbar}>
        <div style={styles.logo}>₿ FIFO IRPF</div>
        <div style={styles.navLinks}>
          {NAV_LINKS.map(({ href, label }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link key={href} href={href} style={navLinkStyle(active)}>
                {label}
              </Link>
            )
          })}
        </div>
        <div style={styles.yearSelector}>
          <select
            style={styles.select}
            value={year}
            onChange={e => handleYearChange(Number(e.target.value))}
            aria-label="Año fiscal"
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button style={styles.importBtn} onClick={() => router.push('/config')}>
            + Importar
          </button>
        </div>
      </nav>
      <main style={styles.main}>{children}</main>
    </YearContext.Provider>
  )
}
