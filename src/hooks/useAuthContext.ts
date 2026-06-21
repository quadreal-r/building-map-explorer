import { useContext } from 'react'
import { AuthContext } from '@/app/authContextState'
import type { AuthContextValue } from '@/app/authContext.types'

export function useAuthContext(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuthContext must be used within AuthProvider')
  return value
}
