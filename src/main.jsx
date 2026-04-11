import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './components/Login'
import './index.css'

function AuthGate() {
  const { loading, user, configured } = useAuth()

  if (loading) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
          color: 'var(--text-muted)',
          fontSize: 15,
        }}
      >
        Cargando sesión…
      </div>
    )
  }

  if (!configured || !user) {
    return <Login />
  }

  return <App />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  </React.StrictMode>,
)
