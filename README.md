# FIFO IRPF Dashboard

Dashboard local para calcular ganancias/pérdidas en criptomonedas aplicando el método FIFO para la declaración del IRPF español.

## Características

- **Kraken:** conecta directamente via API REST
- **Binance:** importa el CSV de historial de trades
- **FIFO automático** conforme a la normativa española (Ley 35/2006)
- **Conversión a EUR** automática via CoinGecko (precios históricos en caché)
- **Export CSV** listo para el modelo 100 del IRPF
- **Estimación del impuesto** según tramos 2024

## Requisitos

- Node.js 18+
- npm

## Instalación

```bash
# Clonar el repositorio
git clone https://github.com/Myshkin16/FIFO-PAEZ.git
cd FIFO-PAEZ

# Instalar dependencias del backend
cd backend
npm install

# Instalar dependencias del frontend
cd ../frontend
npm install
```

## Configuración

```bash
# Copiar el archivo de ejemplo
cd backend
cp .env.example .env
# Editar .env y establecer ENCRYPTION_SECRET con una cadena aleatoria de 32+ caracteres
```

## Uso

```bash
# Terminal 1 — Backend
cd backend
npm start
# Arranca en http://localhost:3001

# Terminal 2 — Frontend
cd frontend
npm run dev
# Arranca en http://localhost:5173
```

Abre http://localhost:5173 en tu navegador.

## Primeros pasos

1. Ve a **Config** e introduce tus API Keys de Kraken (solo lectura: Query Funds, Query Closed Orders, Query Ledger Entries)
2. Haz clic en **Importar desde Kraken** para descargar tu historial
3. Si tienes Binance: exporta el historial de trades desde Binance y súbelo en Config
4. Selecciona el año fiscal en la barra superior
5. Ve a **Exportar** para descargar el CSV para el IRPF

## Estructura del proyecto

```
FIFO-PAEZ/
├── backend/               # Express API + FIFO engine
│   ├── src/
│   │   ├── db/            # SQLite schema y singleton
│   │   ├── services/      # FIFO, precios, Kraken, Binance, export
│   │   └── routes/        # Endpoints REST
│   └── package.json
├── frontend/              # Vite + React dashboard
│   ├── src/
│   │   ├── api/           # Cliente axios
│   │   ├── components/    # KpiCard, GainChart, TradesTable, etc.
│   │   └── pages/         # Resumen, Operaciones, PorCrypto, Exportar, Config
│   └── package.json
└── docs/
    └── superpowers/specs/ # Documentación de diseño
```

## Notas legales

Esta herramienta es solo orientativa. Para la declaración oficial del IRPF consulta con un asesor fiscal. El cálculo del impuesto estimado no tiene en cuenta compensaciones con otras rentas del capital mobiliario.
