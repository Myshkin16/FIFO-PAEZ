# FIFO IRPF Dashboard — Design Spec
**Date:** 2026-04-29  
**Status:** Implemented

## Overview
Local web app for calculating crypto FIFO gains/losses for the Spanish IRPF tax declaration. Connects to Kraken via REST API and accepts Binance trade history CSV exports. Converts all amounts to EUR via CoinGecko historical prices and displays a dashboard with the FIFO calculations ready for the modelo 100.

## Architecture

### Stack
- **Frontend:** Vite + React 18, React Router v6, TanStack Query v5, Recharts, Axios
- **Backend:** Node.js + Express (port 3001)
- **Database:** SQLite via better-sqlite3 (WAL mode)
- **Price data:** CoinGecko API with SQLite cache

### Data Flow
1. User configures Kraken API keys in Config page (stored AES-256-GCM encrypted in SQLite)
2. Import: backend calls Kraken TradesHistory API OR parses uploaded Binance CSV
3. Non-EUR prices converted to EUR via CoinGecko historical API (cached)
4. FIFO engine processes all normalized transactions (per-crypto, chronological)
5. Frontend displays KPI cards, annual chart, per-crypto breakdown, full trades table
6. Export: CSV in IRPF format (Fecha venta, Valor adquisición FIFO, Valor transmisión, G/P EUR)

## Key Design Decisions

- **FIFO is mandatory** in Spain (Ley 35/2006, art. 37.2) — no LIFO or average cost
- **EUR conversion:** CoinGecko historical price cached in SQLite to avoid repeated API calls
- **Encryption:** AES-256-GCM with random per-value salt + IV; key derived via scrypt from ENCRYPTION_SECRET env var
- **Tax tranches (2024):** 19% (0-6k), 21% (6k-50k), 23% (50k-200k), 27% (200k-300k), 28% (>300k)
- **Swap treatment:** crypto-to-crypto swaps are taxable events (two operations)

## Pages
1. **Resumen** — KPI cards + annual chart + crypto breakdown + recent trades + import button
2. **Operaciones** — Full FIFO results table for selected year
3. **Por Crypto** — Breakdown and detail by individual asset
4. **Exportar** — CSV download for IRPF (formato modelo 100)
5. **Config** — Kraken API key management + import triggers

## API Endpoints
| Method | Route | Description |
|--------|-------|-------------|
| GET | /api/health | Health check |
| GET | /api/config/kraken-keys | Check if keys configured |
| POST | /api/config/kraken-keys | Save encrypted keys |
| DELETE | /api/config/kraken-keys | Remove keys |
| POST | /api/import/kraken | Pull trade history from Kraken |
| POST | /api/import/binance | Upload and parse Binance CSV |
| GET | /api/fifo?year=YYYY | FIFO results for a year |
| GET | /api/fifo/summary | All-years summary |
| GET | /api/export/csv?year=YYYY | Download IRPF CSV |
