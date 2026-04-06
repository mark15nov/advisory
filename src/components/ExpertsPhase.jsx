// src/components/ExpertsPhase.jsx
import React, { useState } from 'react'
import { Plus, Trash2, ArrowRight, Users } from 'lucide-react'

export default function ExpertsPhase({ session, onComplete, initialExperts }) {
  const [experts, setExperts] = useState(
    initialExperts && initialExperts.length > 0
      ? initialExperts
      : [{ id: 1, name: '', role: '', opinion: '' }]
  )

  const addExpert = () => {
    setExperts(prev => [...prev, { id: Date.now(), name: '', role: '', opinion: '' }])
  }

  const removeExpert = (id) => {
    if (experts.length === 1) return
    setExperts(prev => prev.filter(e => e.id !== id))
  }

  const updateExpert = (id, field, value) => {
    setExperts(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e))
  }

  const canContinue = experts.some(e => e.name.trim() && e.opinion.trim().length > 20)

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.badge}>
          <Users size={13} />
          CAPTURA DE OPINIONES
        </div>
        <h2 style={styles.title}>Opiniones del consejo</h2>
        <p style={styles.subtitle}>
          Registra la opinión de cada miembro del foro sobre el caso de <strong>{session.presenter}</strong>.
        </p>
      </div>

      <div style={styles.contextCard}>
        <div style={styles.contextHeader}>
          <span style={styles.contextLabel}>Contexto para los consejeros</span>
        </div>
        <div style={styles.contextBody}>
          {session.presenter && (
            <p style={styles.contextLine}>
              <strong>Presentador:</strong> {session.presenter}
            </p>
          )}
          {session.whatYouDo && (
            <p style={styles.contextLine}>
              <strong>Actividad:</strong> {session.whatYouDo}
            </p>
          )}
          {session.caseText && (
            <p style={styles.contextLine}>
              <strong>Caso:</strong> {session.caseText.length > 280
                ? session.caseText.slice(0, 280) + '…'
                : session.caseText}
            </p>
          )}
        </div>
        <div style={styles.promptsSection}>
          <span style={styles.promptsLabel}>Preguntas sugeridas para guiar las opiniones:</span>
          <ul style={styles.promptsList}>
            <li style={styles.promptItem}>¿Qué experiencia similar has tenido y qué aprendiste?</li>
            <li style={styles.promptItem}>¿Cuál consideras que es el mayor riesgo si no se actúa?</li>
            <li style={styles.promptItem}>¿Qué harías diferente si estuvieras en su lugar?</li>
            <li style={styles.promptItem}>¿Qué recurso o contacto podrías aportar para ayudar?</li>
          </ul>
        </div>
      </div>

      <div style={styles.expertList}>
        {experts.map((expert, index) => (
          <div key={expert.id} style={styles.expertCard}>
            <div style={styles.cardHeader}>
              <span style={styles.expertNumber}>Consejero {index + 1}</span>
              {experts.length > 1 && (
                <button style={styles.removeBtn} onClick={() => removeExpert(expert.id)}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <div style={styles.cardRow}>
              <input
                style={styles.input}
                placeholder="Nombre del consejero"
                value={expert.name}
                onChange={e => updateExpert(expert.id, 'name', e.target.value)}
              />
              <input
                style={styles.input}
                placeholder="Especialidad o empresa"
                value={expert.role}
                onChange={e => updateExpert(expert.id, 'role', e.target.value)}
              />
            </div>
            <textarea
              style={styles.textarea}
              placeholder="Captura la opinión, recomendaciones y perspectiva de este consejero sobre el caso..."
              value={expert.opinion}
              onChange={e => updateExpert(expert.id, 'opinion', e.target.value)}
              rows={4}
            />
          </div>
        ))}
      </div>

      <div style={styles.actions}>
        <button style={styles.addBtn} onClick={addExpert}>
          <Plus size={15} />
          Agregar consejero
        </button>
        <button
          style={{ ...styles.primaryBtn, opacity: canContinue ? 1 : 0.4 }}
          onClick={() => canContinue && onComplete(experts)}
          disabled={!canContinue}
        >
          Generar plan de acción
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 28,
    maxWidth: 800,
    margin: '0 auto',
    padding: '40px 24px',
    height: '100%',
    overflowY: 'auto',
  },
  header: { display: 'flex', flexDirection: 'column', gap: 10 },
  badge: {
    display: 'inline-flex', alignSelf: 'flex-start',
    alignItems: 'center', gap: 6,
    fontSize: 11, fontWeight: 600, letterSpacing: '0.12em',
    color: 'var(--gold)', border: '1px solid var(--gold)',
    padding: '4px 10px', borderRadius: 2,
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 32, fontWeight: 700, color: 'var(--text)',
  },
  subtitle: { fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 },
  contextCard: {
    background: 'var(--gold-dim)',
    border: '1px solid var(--gold)',
    borderRadius: 8,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  contextHeader: {
    display: 'flex', alignItems: 'center',
  },
  contextLabel: {
    fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--gold)',
  },
  contextBody: {
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  contextLine: {
    fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: 0,
  },
  promptsSection: {
    borderTop: '1px solid var(--gold)',
    paddingTop: 12,
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  promptsLabel: {
    fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
  },
  promptsList: {
    margin: 0, paddingLeft: 18,
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  promptItem: {
    fontSize: 13, color: 'var(--text)', lineHeight: 1.5,
  },
  expertList: { display: 'flex', flexDirection: 'column', gap: 16 },
  expertCard: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  cardHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  expertNumber: {
    fontSize: 11, fontWeight: 600, letterSpacing: '0.1em',
    color: 'var(--gold)', textTransform: 'uppercase',
  },
  removeBtn: {
    background: 'none', border: 'none',
    color: 'var(--text-dim)', cursor: 'pointer', padding: 4,
    display: 'flex', alignItems: 'center',
    borderRadius: 4,
    transition: 'color 0.2s',
  },
  cardRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  input: {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '10px 12px',
    fontSize: 13, color: 'var(--text)',
    outline: 'none',
  },
  textarea: {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '12px',
    fontSize: 13, color: 'var(--text)',
    outline: 'none', resize: 'none', lineHeight: 1.6,
  },
  actions: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 24,
  },
  addBtn: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text-muted)',
    borderRadius: 6, padding: '10px 18px',
    fontSize: 13, cursor: 'pointer',
    transition: 'border-color 0.2s, color 0.2s',
  },
  primaryBtn: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'var(--gold)', color: '#fff',
    border: 'none', borderRadius: 6,
    padding: '12px 24px', fontSize: 14, fontWeight: 600,
    cursor: 'pointer', transition: 'opacity 0.2s',
  },
}
