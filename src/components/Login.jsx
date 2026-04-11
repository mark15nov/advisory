import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn, configured, authError, setAuthError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setAuthError(null)
    if (!email.trim() || !password) {
      setAuthError('Introduce correo y contraseña.')
      return
    }
    setSubmitting(true)
    try {
      const { error } = await signIn(email, password)
      if (error) {
        // authError ya lo pone signIn para mensajes conocidos
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!configured) {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <h1 style={styles.title}>Configuración necesaria</h1>
          <p style={styles.p}>
            Añade en tu archivo <code style={styles.code}>.env</code> o{' '}
            <code style={styles.code}>.env.local</code>:
          </p>
          <pre style={styles.pre}>
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=tu_clave_anon`}
          </pre>
          <p style={styles.pMuted}>
            Los valores están en Supabase → Project Settings → API. Reinicia{' '}
            <code style={styles.code}>npm run dev</code> tras guardar.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.brand}>
          <span style={styles.brandName}>Advisory</span>
          <span style={styles.brandSub}>Business Boards</span>
        </div>
        <h1 style={styles.heading}>Iniciar sesión</h1>
        <p style={styles.pMuted}>
          Solo pueden acceder las cuentas creadas en el panel de Supabase (Authentication → Users).
        </p>
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Correo
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              disabled={submitting}
            />
          </label>
          <label style={styles.label}>
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              disabled={submitting}
            />
          </label>
          {authError && <p style={styles.error}>{authError}</p>}
          <button type="submit" style={styles.submit} disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles = {
  wrap: {
    minHeight: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: 'var(--bg)',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    padding: 32,
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    boxShadow: '0 8px 32px rgba(26, 26, 46, 0.06)',
  },
  brand: { marginBottom: 20, lineHeight: 1.15 },
  brandName: {
    fontFamily: 'var(--font-display)',
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--text)',
    display: 'block',
  },
  brandSub: {
    fontSize: 10,
    letterSpacing: '0.12em',
    color: 'var(--text-dim)',
    textTransform: 'uppercase',
    display: 'block',
    marginTop: 4,
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 12,
    color: 'var(--text)',
  },
  heading: {
    fontFamily: 'var(--font-display)',
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 8,
    color: 'var(--text)',
  },
  p: { fontSize: 14, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 },
  pMuted: { fontSize: 13, color: 'var(--text-dim)', marginBottom: 20, lineHeight: 1.5 },
  pre: {
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    background: 'var(--surface-2)',
    padding: 12,
    borderRadius: 8,
    overflow: 'auto',
    marginBottom: 12,
    border: '1px solid var(--border)',
    color: 'var(--text)',
  },
  code: { fontFamily: 'var(--font-mono)', fontSize: '0.95em' },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' },
  input: {
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    fontSize: 15,
    background: 'var(--bg)',
    color: 'var(--text)',
  },
  error: { fontSize: 13, color: 'var(--red)', margin: 0 },
  submit: {
    marginTop: 4,
    padding: '12px 16px',
    borderRadius: 8,
    border: 'none',
    background: 'var(--gold)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
  },
}
