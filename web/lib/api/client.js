import axios from 'axios'

// In Next.js everything lives on the same origin, so relative paths work in
// both server and client contexts. No baseURL needed.
const api = axios.create({ baseURL: '/api' })

export const getHealth = () => api.get('/health').then(r => r.data)
export const getFifo = (year) => api.get(`/fifo?year=${year}`).then(r => r.data)
export const getFifoSummary = () => api.get('/fifo/summary').then(r => r.data)
export const getKrakenConfig = () => api.get('/config/kraken-keys').then(r => r.data)
export const saveKrakenKeys = (apiKey, privateKey) => api.post('/config/kraken-keys', { apiKey, privateKey }).then(r => r.data)
export const deleteKrakenKeys = () => api.delete('/config/kraken-keys').then(r => r.data)
export const importKraken = () => api.post('/import/kraken').then(r => r.data)
export const importBinance = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/import/binance', fd).then(r => r.data)
}
export const repricePrices = () => api.post('/fifo/reprice').then(r => r.data)
export const exportCsv = (year) => {
  if (typeof window !== 'undefined') {
    window.location.href = `/api/export/csv?year=${year}`
  }
}

export default api
