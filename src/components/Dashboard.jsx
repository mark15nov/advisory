// src/components/Dashboard.jsx
import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Clock, Building2, User, Trash2, Eye, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  fetchAdvisorySessions,
  deleteAdvisorySession,
  migrateLocalHistoryToSupabase,
  loadLocalHistory,
} from '../lib/advisorySessions'

export default function Dashboard({ onNewSession, onViewSession }) {
  const { user } = useAuth()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const refreshSessions = useCallback(async () => {
    if (!user?.id) {
      setSessions(loadLocalHistory())
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    const mig = await migrateLocalHistoryToSupabase(user.id)
    if (mig.error) {
      console.error('Migración local → Supabase:', mig.error.message)
    }
    const { data, error } = await fetchAdvisorySessions(user.id)
    if (error) {
      setLoadError('No se pudieron cargar las sesiones desde el servidor.')
      setSessions(loadLocalHistory())
    } else {
      setSessions(data || [])
    }
    setLoading(false)
  }, [user?.id])

  useEffect(() => {
    refreshSessions()
  }, [refreshSessions])

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta sesión?')) return
    if (user?.id) {
      const { error } = await deleteAdvisorySession(user.id, id)
      if (error) {
        alert('No se pudo eliminar la sesión. Intenta de nuevo.')
        return
      }
      await refreshSessions()
    } else {
      const next = loadLocalHistory().filter((h) => h.id !== id)
      localStorage.setItem('advisory-history', JSON.stringify(next))
      setSessions(next)
    }
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleDateString('es-MX', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={styles.badge}>CONSILIUM</div>
          <h1 style={styles.title}>Advisory Business Boards</h1>
          <p style={styles.subtitle}>
            Compartiendo experiencia empresarial con IA.
          </p>
        </div>
        <button style={styles.newBtn} onClick={onNewSession}>
          <Plus size={18} />
          Nueva sesión
        </button>
      </div>

      {loading ? (
        <div style={styles.empty}>
          <p style={styles.emptyText}>Cargando sesiones…</p>
        </div>
      ) : loadError ? (
        <p style={styles.errorBanner}>{loadError}</p>
      ) : null}

      {!loading && sessions.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>
            <Building2 size={40} strokeWidth={1} />
          </div>
          <h3 style={styles.emptyTitle}>No hay sesiones guardadas</h3>
          <p style={styles.emptyText}>
            Inicia una nueva sesión para comenzar a trabajar con tu consejo empresarial.
          </p>
          <button style={styles.newBtn} onClick={onNewSession}>
            <Plus size={16} />
            Crear primera sesión
          </button>
        </div>
      ) : !loading ? (
        <div style={styles.grid}>
          {sessions.map((s) => (
            <div key={s.id} style={styles.card}>
              <div style={styles.cardTop}>
                <div style={styles.cardStatus}>
                  {s.completed ? (
                    <span style={styles.statusDone}>COMPLETADA</span>
                  ) : (
                    <span style={styles.statusProgress}>EN PROGRESO</span>
                  )}
                </div>
                <button style={styles.deleteBtn} onClick={() => handleDelete(s.id)}>
                  <Trash2 size={14} />
                </button>
              </div>

              <h3 style={styles.cardTitle}>{s.company || 'Sin empresa'}</h3>

              <div style={styles.cardMeta}>
                <span style={styles.metaItem}>
                  <User size={12} /> {s.presenter}
                </span>
                <span style={styles.metaItem}>
                  <Clock size={12} /> {formatDate(s.createdAt)}
                </span>
              </div>

              {s.industry && (
                <span style={styles.industryTag}>{s.industry}</span>
              )}

              <p style={styles.cardProblem}>
                {s.caseText?.length > 120 ? s.caseText.slice(0, 120) + '...' : s.caseText}
              </p>

              <div style={styles.cardFooter}>
                <div style={styles.stats}>
                  <span style={styles.stat}>{s.questionCount || 0} preguntas</span>
                  <span style={styles.stat}>{s.expertCount || 0} consejeros</span>
                </div>
                <button style={styles.viewBtn} onClick={() => onViewSession(s)}>
                  <Eye size={14} />
                  {s.completed ? 'Ver plan' : 'Continuar'}
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const styles = {
  container: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '48px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 32,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  badge: {
    display: 'inline-flex',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.18em',
    color: 'var(--gold)',
    border: '1px solid var(--gold)',
    padding: '3px 8px',
    borderRadius: 2,
    marginBottom: 12,
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 36,
    fontWeight: 700,
    color: 'var(--text)',
    lineHeight: 1.1,
  },
  subtitle: {
    fontSize: 15,
    color: 'var(--text-muted)',
    lineHeight: 1.6,
    marginTop: 8,
  },
  newBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'var(--gold)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '12px 24px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    padding: '80px 0',
    textAlign: 'center',
  },
  emptyIcon: {
    color: 'var(--text-dim)',
    marginBottom: 8,
  },
  emptyTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 22,
    color: 'var(--text)',
  },
  emptyText: {
    fontSize: 14,
    color: 'var(--text-muted)',
    maxWidth: 400,
  },
  errorBanner: {
    fontSize: 13,
    color: 'var(--red, #c62828)',
    padding: '12px 16px',
    background: 'var(--red-dim, rgba(198,40,40,0.08))',
    borderRadius: 6,
    border: '1px solid var(--border)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 16,
  },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    transition: 'border-color 0.2s',
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardStatus: {},
  statusDone: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.1em',
    color: 'var(--green, #4caf7a)',
    background: 'var(--green-dim, rgba(76,175,122,0.12))',
    padding: '3px 8px',
    borderRadius: 3,
  },
  statusProgress: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.1em',
    color: 'var(--gold)',
    background: 'var(--gold-dim)',
    padding: '3px 8px',
    borderRadius: 3,
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-dim)',
    cursor: 'pointer',
    padding: 4,
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
  },
  cardTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 20,
    fontWeight: 600,
    color: 'var(--text)',
  },
  cardMeta: {
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap',
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  industryTag: {
    display: 'inline-flex',
    alignSelf: 'flex-start',
    fontSize: 11,
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
    padding: '2px 8px',
    borderRadius: 3,
  },
  cardProblem: {
    fontSize: 13,
    color: 'var(--text-dim)',
    lineHeight: 1.5,
    flex: 1,
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTop: '1px solid var(--border)',
    paddingTop: 12,
    marginTop: 4,
  },
  stats: {
    display: 'flex',
    gap: 12,
  },
  stat: {
    fontSize: 11,
    color: 'var(--text-dim)',
  },
  viewBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'none',
    border: '1px solid var(--gold)',
    color: 'var(--gold)',
    borderRadius: 5,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  },
}
