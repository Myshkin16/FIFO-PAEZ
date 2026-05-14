import './globals.css'
import AppShell from './AppShell'

export const metadata = {
  title: 'FIFO IRPF — Dashboard',
  description: 'Cálculo FIFO de IRPF para criptomonedas',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
