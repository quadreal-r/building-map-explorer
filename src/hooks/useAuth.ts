import { useAuthContext } from '@/hooks/useAuthContext'

export function useAuth() {
  return useAuthContext()
}

export { isSupabaseConfigured } from '@/lib/supabaseClient'
