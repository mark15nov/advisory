// src/components/ReviewPhase.jsx
import React from 'react'
import { ArrowLeft, ArrowRight, ClipboardCheck, User, Building2, MapPin, Users, DollarSign, Calendar, Briefcase, Target, Star, AlertCircle, MessageSquare, UserCheck } from 'lucide-react'

export default function ReviewPhase({ session, questionHistory, experts, onConfirm, onBack }) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.badge}>
          <ClipboardCheck size={13} />
          REVISIÓN FINAL
        </div>
        <h2 style={styles.title}>Revisa antes de generar</h2>
        <p style={styles.subtitle}>
          Confirma que toda la información capturada es correcta antes de generar el plan de acción.
        </p>
      </div>

      {/* 1. Datos del presentador */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.sectionLabel}>
            <User size={14} />
            Datos del presentador
          </div>
          <span style={styles.editHint}>Regresa para editar si es necesario</span>
        </div>
        <div style={styles.grid}>
          <DataItem label="Nombre" value={session.presenter} />
          <DataItem label="Cargo / Rol" value={session.role} />
          <DataItem label="Empresa" value={session.company} icon={<Building2 size={12} />} />
          <DataItem label="Industria" value={session.industry} icon={<Briefcase size={12} />} />
          <DataItem label="Ubicación" value={session.location} icon={<MapPin size={12} />} />
          <DataItem label="Años operando" value={session.yearsInBusiness} icon={<Calendar size={12} />} />
          <DataItem label="Empleados" value={session.employees} icon={<Users size={12} />} />
          <DataItem label="Facturación anual" value={session.revenue} icon={<DollarSign size={12} />} />
        </div>
      </div>

      {/* 2. Sobre tu negocio */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.sectionLabel}>
            <Target size={14} />
            Sobre tu negocio
          </div>
          <span style={styles.editHint}>Regresa para editar si es necesario</span>
        </div>
        <div style={styles.textBlock}>
          <div style={styles.textLabel}>
            <Star size={12} />
            A qué se dedica
          </div>
          <p style={styles.textValue}>{session.whatYouDo || <span style={styles.empty}>No proporcionado</span>}</p>
        </div>
        {session.differentiation && (
          <div style={styles.textBlock}>
            <div style={styles.textLabel}>
              <Star size={12} />
              Diferenciación
            </div>
            <p style={styles.textValue}>{session.differentiation}</p>
          </div>
        )}
      </div>

      {/* 3. Problema */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.sectionLabel}>
            <AlertCircle size={14} />
            Problema a resolver
          </div>
          <span style={styles.editHint}>Regresa para editar si es necesario</span>
        </div>
        <p style={styles.caseText}>{session.caseText}</p>
      </div>

      {/* 4. Diagnóstico */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.sectionLabel}>
            <MessageSquare size={14} />
            Diagnóstico — Preguntas y respuestas
          </div>
          <span style={styles.editHint}>{questionHistory.length} preguntas capturadas</span>
        </div>
        <div style={styles.qaList}>
          {questionHistory.map((item, i) => (
            <div key={i} style={styles.qaItem}>
              <div style={styles.questionBlock}>
                <span style={styles.qaTag}>PREGUNTA {i + 1}</span>
                <p style={styles.qaText}>{item.question}</p>
              </div>
              <div style={styles.answerBlock}>
                <span style={styles.qaTagAnswer}>RESPUESTA</span>
                <p style={styles.qaText}>{item.answer}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Opiniones del consejo */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.sectionLabel}>
            <UserCheck size={14} />
            Opiniones del consejo
          </div>
          <span style={styles.editHint}>{experts.length} consejero{experts.length !== 1 ? 's' : ''}</span>
        </div>
        <div style={styles.expertsList}>
          {experts.map((expert, i) => (
            <div key={i} style={styles.expertItem}>
              <div style={styles.expertHeader}>
                <span style={styles.expertName}>{expert.name}</span>
                {expert.role && <span style={styles.expertRole}>{expert.role}</span>}
              </div>
              <p style={styles.expertOpinion}>{expert.opinion}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={styles.actions}>
        <button style={styles.backBtn} onClick={onBack}>
          <ArrowLeft size={15} />
          Regresar a editar
        </button>
        <button style={styles.confirmBtn} onClick={onConfirm}>
          Confirmar y generar plan
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )
}

function DataItem({ label, value, icon }) {
  if (!value) return null
  return (
    <div style={styles.dataItem}>
      <span style={styles.dataLabel}>
        {icon && <span style={{ marginRight: 4, display: 'inline-flex', alignItems: 'center' }}>{icon}</span>}
        {label}
      </span>
      <span style={styles.dataValue}>{value}</span>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    maxWidth: 800,
    margin: '0 auto',
    padding: '40px 24px 48px',
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

  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  cardHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottom: '1px solid var(--border)',
  },
  sectionLabel: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 11, fontWeight: 600, letterSpacing: '0.12em',
    color: 'var(--gold)', textTransform: 'uppercase',
  },
  editHint: {
    fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic',
  },

  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  dataItem: {
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  dataLabel: {
    display: 'flex', alignItems: 'center',
    fontSize: 11, fontWeight: 500, letterSpacing: '0.08em',
    color: 'var(--text-dim)', textTransform: 'uppercase',
  },
  dataValue: {
    fontSize: 14, color: 'var(--text)', lineHeight: 1.4,
  },

  textBlock: {
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  textLabel: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 11, fontWeight: 500, letterSpacing: '0.08em',
    color: 'var(--text-dim)', textTransform: 'uppercase',
  },
  textValue: {
    fontSize: 14, color: 'var(--text)', lineHeight: 1.6,
    margin: 0,
  },
  empty: {
    color: 'var(--text-dim)', fontStyle: 'italic',
  },

  caseText: {
    fontSize: 14, color: 'var(--text)', lineHeight: 1.7,
    margin: 0,
    whiteSpace: 'pre-wrap',
  },

  qaList: {
    display: 'flex', flexDirection: 'column', gap: 16,
  },
  qaItem: {
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  questionBlock: {
    background: 'var(--gold-dim)',
    border: '1px solid rgba(201,168,76,0.25)',
    borderRadius: 6,
    padding: '12px 14px',
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  answerBlock: {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '12px 14px',
    marginLeft: 20,
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  qaTag: {
    fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
    color: 'var(--gold)', textTransform: 'uppercase',
  },
  qaTagAnswer: {
    fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
    color: 'var(--text-muted)', textTransform: 'uppercase',
  },
  qaText: {
    fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: 0,
  },

  expertsList: {
    display: 'flex', flexDirection: 'column', gap: 14,
  },
  expertItem: {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '14px 16px',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  expertHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
  },
  expertName: {
    fontSize: 14, fontWeight: 600, color: 'var(--text)',
  },
  expertRole: {
    fontSize: 12, color: 'var(--text-dim)',
    padding: '2px 8px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 4,
  },
  expertOpinion: {
    fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0,
  },

  actions: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 24,
  },
  backBtn: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text-muted)',
    borderRadius: 6, padding: '12px 20px',
    fontSize: 13, fontWeight: 500, cursor: 'pointer',
    transition: 'border-color 0.2s, color 0.2s',
  },
  confirmBtn: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'var(--gold)', color: '#fff',
    border: 'none', borderRadius: 6,
    padding: '12px 24px', fontSize: 14, fontWeight: 600,
    cursor: 'pointer', transition: 'opacity 0.2s',
  },
}
