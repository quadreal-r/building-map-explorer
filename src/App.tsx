import { Providers } from '@/app/providers'
import { AppShell } from '@/app/AppShell'
import { ErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary'
import '@/styles/legacy.css'

function App() {
  return (
    <ErrorBoundary>
      <Providers>
        <AppShell />
      </Providers>
    </ErrorBoundary>
  )
}

export default App
