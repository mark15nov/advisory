// src/components/SetupPhase.jsx
import React, { useState } from 'react'
import { ArrowRight, Building2, User, MapPin, Users, DollarSign, Calendar, Briefcase, Target, Star, Play, Clock } from 'lucide-react'

export default function SetupPhase({ onStart, initialData, timerRunning, onStartTimer }) {
  const [presenter, setPresenter] = useState(initialData?.presenter || '')
  const [role, setRole] = useState(initialData?.role || '')
  const [company, setCompany] = useState(initialData?.company || '')
  const [industry, setIndustry] = useState(initialData?.industry || '')
  const [location, setLocation] = useState(initialData?.location || '')
  const [employees, setEmployees] = useState(initialData?.employees || '')
  const [revenue, setRevenue] = useState(initialData?.revenue || '')
  const [yearsInBusiness, setYearsInBusiness] = useState(initialData?.yearsInBusiness || '')
  const [whatYouDo, setWhatYouDo] = useState(initialData?.whatYouDo || '')
  const [differentiation, setDifferentiation] = useState(initialData?.differentiation || '')
  const [caseText, setCaseText] = useState(initialData?.caseText || '')

  const canStart = presenter.trim() && company.trim() && industry.trim() && whatYouDo.trim() && caseText.trim().length > 30

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.badge}>NUEVA SESIÓN</div>
        <h1 style={styles.title}>Presenta tu caso</h1>
        <p style={styles.subtitle}>
          Completa la información de tu empresa para que el consejo tenga el contexto necesario antes de iniciar la sesión.
        </p>
      </div>

      {/* Timer control */}
      {!timerRunning ? (
        <button style={styles.timerBtn} onClick={onStartTimer}>
          <Play size={16} />
          Iniciar sesión (60 min)
        </button>
      ) : (
        <div style={styles.timerActive}>
          <Clock size={14} />
          Sesión en curso — el temporizador está corriendo
        </div>
      )}

      <div style={styles.form}>
        {/* Sección: Presentador */}
        <div style={styles.sectionLabel}>Datos del presentador</div>
        <div style={styles.row}>
          <div style={styles.field}>
            <label style={styles.label}>
              <User size={14} style={{ marginRight: 6 }} />
              Nombre completo *
            </label>
            <input
              style={styles.input}
              placeholder="Ej. Carlos Mendoza"
              value={presenter}
              onChange={e => setPresenter(e.target.value)}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>
              <Briefcase size={14} style={{ marginRight: 6 }} />
              Cargo / Rol
            </label>
            <input
              style={styles.input}
              placeholder="Ej. Director General, Fundador"
              value={role}
              onChange={e => setRole(e.target.value)}
            />
          </div>
        </div>

        {/* Sección: Empresa */}
        <div style={styles.sectionLabel}>Datos de la empresa</div>
        <div style={styles.row}>
          <div style={styles.field}>
            <label style={styles.label}>
              <Building2 size={14} style={{ marginRight: 6 }} />
              Nombre de la empresa *
            </label>
            <input
              style={styles.input}
              placeholder="Ej. Distribuidora Norte S.A."
              value={company}
              onChange={e => setCompany(e.target.value)}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>
              <Briefcase size={14} style={{ marginRight: 6 }} />
              Industria / Giro *
            </label>
            <input
              style={styles.input}
              placeholder="Ej. Manufactura, Retail, Tecnología"
              value={industry}
              onChange={e => setIndustry(e.target.value)}
            />
          </div>
        </div>

        <div style={styles.row}>
          <div style={styles.field}>
            <label style={styles.label}>
              <MapPin size={14} style={{ marginRight: 6 }} />
              Ubicación
            </label>
            <input
              style={styles.input}
              placeholder="Ej. Monterrey, Nuevo León"
              value={location}
              onChange={e => setLocation(e.target.value)}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>
              <Calendar size={14} style={{ marginRight: 6 }} />
              Años operando
            </label>
            <input
              style={styles.input}
              placeholder="Ej. 12"
              value={yearsInBusiness}
              onChange={e => setYearsInBusiness(e.target.value)}
            />
          </div>
        </div>

        <div style={styles.row}>
          <div style={styles.field}>
            <label style={styles.label}>
              <Users size={14} style={{ marginRight: 6 }} />
              Número de empleados
            </label>
            <select
              style={styles.input}
              value={employees}
              onChange={e => setEmployees(e.target.value)}
            >
              <option value="">Selecciona...</option>
              <option value="1-10">1 – 10</option>
              <option value="11-50">11 – 50</option>
              <option value="51-200">51 – 200</option>
              <option value="201-500">201 – 500</option>
              <option value="500+">Más de 500</option>
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>
              <DollarSign size={14} style={{ marginRight: 6 }} />
              Facturación anual aprox.
            </label>
            <select
              style={styles.input}
              value={revenue}
              onChange={e => setRevenue(e.target.value)}
            >
              <option value="">Selecciona...</option>
              <option value="<1M">Menos de $1M</option>
              <option value="1M-5M">$1M – $5M</option>
              <option value="5M-20M">$5M – $20M</option>
              <option value="20M-100M">$20M – $100M</option>
              <option value="100M+">Más de $100M</option>
            </select>
          </div>
        </div>

        {/* Sección: Sobre tu negocio */}
        <div style={styles.sectionLabel}>Sobre tu negocio</div>
        <div style={styles.field}>
          <label style={styles.label}>
            <Target size={14} style={{ marginRight: 6 }} />
            ¿A qué se dedica tu empresa? *
          </label>
          <textarea
            style={styles.textarea}
            placeholder="Describe brevemente qué hace tu empresa, qué productos o servicios ofreces y a quién le vendes..."
            value={whatYouDo}
            onChange={e => setWhatYouDo(e.target.value)}
            rows={3}
          />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>
            <Star size={14} style={{ marginRight: 6 }} />
            ¿Qué te diferencia de los demás?
          </label>
          <textarea
            style={styles.textarea}
            placeholder="¿Qué hace única a tu empresa? ¿Por qué te eligen tus clientes sobre la competencia?"
            value={differentiation}
            onChange={e => setDifferentiation(e.target.value)}
            rows={3}
          />
        </div>

        {/* Sección: Problema */}
        <div style={styles.sectionLabel}>Problema a resolver</div>
        <div style={{ ...styles.field, flex: 1 }}>
          <label style={styles.label}>¿Cuál es el problema que quieres resolver hoy? *</label>
          <textarea
            style={styles.textarea}
            placeholder="Describe el problema principal que enfrentas en tu negocio y qué tipo de orientación buscas del consejo..."
            value={caseText}
            onChange={e => setCaseText(e.target.value)}
            rows={7}
          />
          <span style={styles.counter}>{caseText.length} caracteres</span>
        </div>

        <button
          style={{ ...styles.btn, opacity: canStart ? 1 : 0.4 }}
          onClick={() => canStart && onStart({ presenter, role, company, industry, location, employees, revenue, yearsInBusiness, whatYouDo, differentiation, caseText })}
          disabled={!canStart}
        >
          Iniciar sesión del consejo
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 32,
    maxWidth: 720,
    margin: '0 auto',
    padding: '48px 24px',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  badge: {
    display: 'inline-flex',
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.15em',
    color: 'var(--gold)',
    border: '1px solid var(--gold)',
    padding: '4px 10px',
    borderRadius: 2,
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 42,
    fontWeight: 700,
    color: 'var(--text)',
    lineHeight: 1.1,
  },
  subtitle: {
    fontSize: 15,
    color: 'var(--text-muted)',
    lineHeight: 1.6,
    maxWidth: 520,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.12em',
    color: 'var(--gold)',
    textTransform: 'uppercase',
    marginTop: 8,
    paddingBottom: 4,
    borderBottom: '1px solid var(--border)',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    position: 'relative',
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: '0.08em',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
  },
  input: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '12px 14px',
    fontSize: 14,
    color: 'var(--text)',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  textarea: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '14px',
    fontSize: 14,
    color: 'var(--text)',
    outline: 'none',
    resize: 'none',
    lineHeight: 1.6,
  },
  counter: {
    fontSize: 11,
    color: 'var(--text-dim)',
    textAlign: 'right',
    position: 'absolute',
    bottom: -20,
    right: 0,
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    background: 'var(--gold)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '14px 28px',
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: '0.04em',
    marginTop: 8,
    transition: 'background 0.2s, opacity 0.2s',
    cursor: 'pointer',
  },
  timerBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    background: 'var(--gold)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '16px 32px',
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: '0.04em',
    cursor: 'pointer',
    width: '100%',
    transition: 'opacity 0.2s',
  },
  timerActive: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    background: 'var(--gold-dim)',
    border: '1px solid var(--gold)',
    borderRadius: 8,
    padding: '12px 24px',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--gold)',
    width: '100%',
  },
}
