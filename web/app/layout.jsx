import './globals.css'
import { ClerkProvider } from '@clerk/nextjs'
import AppShell from './AppShell'

export const metadata = {
  title: 'FIFO IRPF — Dashboard',
  description: 'Cálculo FIFO de IRPF para criptomonedas',
}

// ClerkProvider wraps the tree at the root so useUser / SignedIn / UserButton
// etc. work everywhere. Theming is tuned to match the dark dashboard palette
// so Clerk's prebuilt sign-in/sign-up cards don't look out of place.
export default function RootLayout({ children }) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorBackground: '#0d1117',
          colorPrimary: '#e94560',
          colorText: '#e6edf3',
          colorInputBackground: '#161b22',
          colorInputText: '#e6edf3',
          colorBorder: '#30363d',
        },
      }}
    >
      <html lang="es">
        <body>
          <AppShell>{children}</AppShell>
        </body>
      </html>
    </ClerkProvider>
  )
}
