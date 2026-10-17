import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from './api'
import { isSignedIn, signOut as sdkSignOut } from './catalyst'

const AuthContext = createContext(null)
const SIGNED_OUT_FLAG = 'ce_signed_out'

export function AuthProvider({ children }) {
  // undefined = still checking, null = signed out
  const [user, setUser] = useState(undefined)

  const refresh = useCallback(async () => {
    // Slate can't clear the backend session cross-origin, so honour our own sign-out flag.
    if (sessionStorage.getItem(SIGNED_OUT_FLAG)) return setUser(null)
    try {
      setUser((await isSignedIn()) ? await api('/me') : null)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const signOut = useCallback(() => {
    sessionStorage.setItem(SIGNED_OUT_FLAG, '1')
    setUser(null)
    sdkSignOut()
  }, [])

  const markSignedIn = useCallback(() => {
    sessionStorage.removeItem(SIGNED_OUT_FLAG)
    return refresh()
  }, [refresh])

  return <AuthContext.Provider value={{ user, refresh, signOut, markSignedIn }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
