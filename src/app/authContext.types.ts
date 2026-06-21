import type { Session } from '@supabase/supabase-js'

export interface AuthContextValue {
  session: Session | null
  user: Session['user'] | null
  isLoading: boolean
  isAuthenticated: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}
