import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal/Modal'
import { isSupabaseConfigured } from '@/lib/supabaseClient'
import { useAuthContext } from '@/hooks/useAuthContext'

export interface LoginModalProps {
  open: boolean
  onClose: () => void
}

export function LoginModal({ open, onClose }: LoginModalProps) {
  const { signIn, signOut, isAuthenticated, user } = useAuthContext()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!isSupabaseConfigured) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Sign in" width={380}>
      {!isSupabaseConfigured ? (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Supabase environment variables are not set. The app runs in read-only mode with bundled JSON data.
        </p>
      ) : isAuthenticated ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 13 }}>Signed in as {user?.email}</p>
          <button type="button" className="btn-action" onClick={() => void signOut().then(onClose)}>
            Sign out
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          {error ? <p style={{ color: '#f87171', fontSize: 12 }}>{error}</p> : null}
          <button type="submit" className="btn-action primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}
    </Modal>
  )
}
