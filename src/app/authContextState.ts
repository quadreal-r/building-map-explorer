import { createContext } from 'react'
import type { AuthContextValue } from '@/app/authContext.types'

export const AuthContext = createContext<AuthContextValue | null>(null)
