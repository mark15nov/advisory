import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { supabaseBrowser, isSupabaseAuthConfigured } from '../lib/supabaseBrowser'
import { setAuthAccessToken } from '../lib/authedFetch'

const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)

  const configured = isSupabaseAuthConfigured()

  useEffect(() => {
    if (!supabaseBrowser) {
      setLoading(false)
      return
    }
    supabaseBrowser.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      setAuthAccessToken(s?.access_token ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabaseBrowser.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setAuthAccessToken(s?.access_token ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (email, password) => {
    setAuthError(null)
    if (!supabaseBrowser) {
      setAuthError('Supabase no está configurado en el cliente.')
      return { error: new Error('not_configured') }
    }
    const { data, error } = await supabaseBrowser.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) {
      const msg =
        error.message === 'Invalid login credentials'
          ? 'Correo o contraseña incorrectos.'
          : (error.message || 'No se pudo iniciar sesión.')
      setAuthError(msg)
      return { error }
    }
    setSession(data.session)
    return { error: null }
  }, [])

  const signOut = useCallback(async () => {
    setAuthError(null)
    if (supabaseBrowser) await supabaseBrowser.auth.signOut()
    setSession(null)
    setAuthAccessToken(null)
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configured,
      authError,
      setAuthError,
      signIn,
      signOut,
    }),
    [session, loading, configured, authError, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
