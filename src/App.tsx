import { Providers } from '@/app/providers'
import { AppShell } from '@/app/AppShell'
import '@/styles/legacy.css'

function App() {
  return (
    <Providers>
      <AppShell />
    </Providers>
  )
}

export default App
