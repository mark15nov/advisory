// src/App.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeft, Home, Pause, Play } from 'lucide-react'
import Dashboard, { saveToHistory } from './components/Dashboard'
import SetupPhase from './components/SetupPhase'
import QuestionsPhase from './components/QuestionsPhase'
import ExpertsPhase from './components/ExpertsPhase'
import ReviewPhase from './components/ReviewPhase'
import SynthesisPhase from './components/SynthesisPhase'
import { PHASES } from './lib/session'

const STORAGE_KEY = 'advisory-session'
const TIMER_KEY = 'advisory-timer-start'
const TIMER_PAUSED_KEY = 'advisory-timer-paused'
const TIMER_ELAPSED_KEY = 'advisory-timer-elapsed'
const TIMER_DURATION = 60 * 60

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

function loadTimerStart() {
  try {
    const val = localStorage.getItem(TIMER_KEY)
    return val ? Number(val) : null
  } catch {
    return null
  }
}

function loadTimerPaused() {
  try {
    return localStorage.getItem(TIMER_PAUSED_KEY) === 'true'
  } catch {
    return false
  }
}

function loadTimerElapsed() {
  try {
    const val = localStorage.getItem(TIMER_ELAPSED_KEY)
    return val ? Number(val) : 0
  } catch {
    return 0
  }
}

function formatTime(totalSeconds) {
  const m = Math.max(0, Math.floor(totalSeconds / 60))
  const s = Math.max(0, totalSeconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function SessionTimer({ startTime, paused, elapsedWhenPaused, onTogglePause }) {
  const [remaining, setRemaining] = useState(() => {
    if (!startTime) return TIMER_DURATION
    if (paused) return Math.max(0, TIMER_DURATION - elapsedWhenPaused)
    const elapsed = Math.floor((Date.now() - startTime) / 1000)
    return Math.max(0, TIMER_DURATION - elapsed)
  })
  const alertShown = useRef(false)

  useEffect(() => {
    if (!startTime) return
    if (paused) {
      setRemaining(Math.max(0, TIMER_DURATION - elapsedWhenPaused))
      return
    }
    function tick() {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      const left = Math.max(0, TIMER_DURATION - elapsed)
      setRemaining(left)
      if (left === 0 && !alertShown.current) {
        alertShown.current = true
        setTimeout(() => alert('El tiempo de la sesión ha terminado.'), 0)
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startTime, paused, elapsedWhenPaused])

  const timerColor =
    remaining < 5 * 60 ? 'var(--red)' :
    remaining < 10 * 60 ? '#e65100' :
    'var(--text-muted)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 18,
        fontWeight: 700,
        color: timerColor,
        letterSpacing: '0.05em',
        padding: '4px 16px',
        borderRadius: 6,
        border: `1px solid ${remaining < 5 * 60 ? 'var(--red)' : 'var(--border)'}`,
        background: remaining < 5 * 60 ? 'var(--red-dim)' : 'var(--surface)',
        transition: 'color 0.5s, border-color 0.5s, background 0.5s',
        minWidth: 72,
        textAlign: 'center',
      }}>
        {formatTime(remaining)}
      </div>
      <button
        onClick={onTogglePause}
        style={{
          background: paused ? 'var(--accent)' : 'var(--surface)',
          border: `1px solid ${paused ? 'var(--accent)' : 'var(--border)'}`,
          color: paused ? '#fff' : 'var(--text-muted)',
          borderRadius: 6,
          padding: 6,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          transition: 'all 0.2s',
        }}
        title={paused ? 'Reanudar' : 'Pausar'}
      >
        {paused ? <Play size={14} /> : <Pause size={14} />}
      </button>
    </div>
  )
}

export default function App() {
  const saved = loadSaved()
  const [view, setView] = useState('dashboard')
  const [phase, setPhase] = useState(saved?.phase ?? PHASES.SETUP)
  const [session, setSession] = useState(saved?.session ?? null)
  const [questionHistory, setQuestionHistory] = useState(saved?.questionHistory ?? [])
  const [experts, setExperts] = useState(saved?.experts ?? [])
  const [synthesisKey, setSynthesisKey] = useState(0)
  const [timerStart, setTimerStart] = useState(loadTimerStart)
  const [timerPaused, setTimerPaused] = useState(loadTimerPaused)
  const [timerElapsed, setTimerElapsed] = useState(loadTimerElapsed)
  const [sessionId, setSessionId] = useState(saved?.sessionId ?? null)
  const [planOutput, setPlanOutput] = useState(saved?.planOutput ?? null)

  const startTimer = useCallback(() => {
    const now = Date.now()
    setTimerStart(now)
    setTimerPaused(false)
    setTimerElapsed(0)
    localStorage.setItem(TIMER_KEY, String(now))
    localStorage.setItem(TIMER_PAUSED_KEY, 'false')
    localStorage.setItem(TIMER_ELAPSED_KEY, '0')
  }, [])

  const resetTimer = useCallback(() => {
    setTimerStart(null)
    setTimerPaused(false)
    setTimerElapsed(0)
    localStorage.removeItem(TIMER_KEY)
    localStorage.removeItem(TIMER_PAUSED_KEY)
    localStorage.removeItem(TIMER_ELAPSED_KEY)
  }, [])

  const togglePause = useCallback(() => {
    if (timerPaused) {
      // Resuming: calculate new start time to account for elapsed time
      const newStart = Date.now() - timerElapsed * 1000
      setTimerStart(newStart)
      setTimerPaused(false)
      localStorage.setItem(TIMER_KEY, String(newStart))
      localStorage.setItem(TIMER_PAUSED_KEY, 'false')
    } else {
      // Pausing: save current elapsed time
      const elapsed = Math.floor((Date.now() - timerStart) / 1000)
      setTimerElapsed(elapsed)
      setTimerPaused(true)
      localStorage.setItem(TIMER_ELAPSED_KEY, String(elapsed))
      localStorage.setItem(TIMER_PAUSED_KEY, 'true')
    }
  }, [timerPaused, timerStart, timerElapsed])

  useEffect(() => {
    if (view === 'session') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        phase, session, questionHistory, experts, sessionId, planOutput,
      }))
    }
  }, [view, phase, session, questionHistory, experts, sessionId, planOutput])

  const steps = [
    { key: PHASES.SETUP, label: 'Caso' },
    { key: PHASES.QUESTIONS, label: 'Diagnóstico' },
    { key: PHASES.EXPERTS, label: 'Consejo' },
    { key: PHASES.REVIEW, label: 'Revisión' },
    { key: PHASES.SYNTHESIS, label: 'Plan' },
  ]

  const activeIndex = steps.findIndex(s => s.key === phase)

  function goBack() {
    if (activeIndex <= 0) return
    setPhase(steps[activeIndex - 1].key)
  }

  function goToStep(index) {
    if (index < activeIndex) {
      setPhase(steps[index].key)
    }
  }

  function startNewSession() {
    localStorage.removeItem(STORAGE_KEY)
    resetTimer()
    setPhase(PHASES.SETUP)
    setSession(null)
    setQuestionHistory([])
    setExperts([])
    setSessionId(Date.now().toString())
    setPlanOutput(null)
    setView('session')
  }

  function goHome() {
    setView('dashboard')
  }

  function loadSession(savedSession) {
    setSession({
      presenter: savedSession.presenter,
      role: savedSession.role,
      company: savedSession.company,
      industry: savedSession.industry,
      location: savedSession.location,
      employees: savedSession.employees,
      revenue: savedSession.revenue,
      yearsInBusiness: savedSession.yearsInBusiness,
      whatYouDo: savedSession.whatYouDo,
      differentiation: savedSession.differentiation,
      caseText: savedSession.caseText,
    })
    setQuestionHistory(savedSession.questionHistory || [])
    setExperts(savedSession.experts || [])
    setSessionId(savedSession.id)
    setPlanOutput(savedSession.planOutput || null)

    if (savedSession.completed && savedSession.planOutput) {
      setPhase(PHASES.SYNTHESIS)
    } else if (savedSession.experts?.length > 0) {
      setPhase(PHASES.REVIEW)
    } else if (savedSession.questionHistory?.length > 0) {
      setPhase(PHASES.EXPERTS)
    } else {
      setPhase(PHASES.SETUP)
    }

    setView('session')
  }

  function saveCurrentSession(plan, completed = false) {
    if (!session) return
    const entry = {
      id: sessionId || Date.now().toString(),
      createdAt: Number(sessionId) || Date.now(),
      presenter: session.presenter,
      role: session.role,
      company: session.company,
      industry: session.industry,
      location: session.location,
      employees: session.employees,
      revenue: session.revenue,
      yearsInBusiness: session.yearsInBusiness,
      whatYouDo: session.whatYouDo,
      differentiation: session.differentiation,
      caseText: session.caseText,
      questionHistory,
      questionCount: questionHistory.length,
      experts,
      expertCount: experts.filter(e => e.name?.trim()).length,
      planOutput: plan,
      completed,
    }
    const history = (JSON.parse(localStorage.getItem('advisory-history') || '[]'))
      .filter(h => h.id !== entry.id)
    history.unshift(entry)
    localStorage.setItem('advisory-history', JSON.stringify(history))
  }

  // Dashboard view
  if (view === 'dashboard') {
    return (
      <div style={styles.root}>
        <nav style={styles.nav}>
          <div style={styles.brand}>
            <span style={styles.brandName}>Advisory</span>
            <span style={styles.brandSub}>Business Boards</span>
          </div>
          <div />
          <div />
        </nav>
        <main style={styles.main}>
          <Dashboard
            onNewSession={startNewSession}
            onViewSession={loadSession}
          />
        </main>
      </div>
    )
  }

  // Session view
  return (
    <div style={styles.root}>
      <nav style={styles.nav}>
        <div style={styles.brand}>
          <button style={styles.homeBtn} onClick={goHome}>
            <Home size={16} />
          </button>
          <div>
            <span style={styles.brandName}>Advisory</span>
            <span style={styles.brandSub}>Business Boards</span>
          </div>
        </div>

        <div style={styles.stepper}>
          {steps.map((step, i) => (
            <React.Fragment key={step.key}>
              <div
                style={{ ...styles.step, cursor: i < activeIndex ? 'pointer' : 'default' }}
                onClick={() => goToStep(i)}
              >
                <div style={{
                  ...styles.stepDot,
                  background: i <= activeIndex ? 'var(--gold)' : 'var(--border)',
                  border: i === activeIndex ? '2px solid var(--gold-light)' : '2px solid transparent',
                  boxShadow: i === activeIndex ? '0 0 10px rgba(198,40,40,0.3)' : 'none',
                }}>
                  {i < activeIndex ? '✓' : i + 1}
                </div>
                <span style={{
                  ...styles.stepLabel,
                  color: i === activeIndex ? 'var(--gold)' : i < activeIndex ? 'var(--text-muted)' : 'var(--text-dim)',
                }}>
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div style={{
                  ...styles.stepLine,
                  background: i < activeIndex ? 'var(--gold)' : 'var(--border)',
                }} />
              )}
            </React.Fragment>
          ))}
        </div>

        {timerStart && (
          <SessionTimer
            startTime={timerStart}
            paused={timerPaused}
            elapsedWhenPaused={timerElapsed}
            onTogglePause={togglePause}
          />
        )}

        <div style={styles.navRight}>
          {activeIndex > 0 && (
            <button style={styles.backBtn} onClick={goBack}>
              <ChevronLeft size={14} />
              Regresar
            </button>
          )}
          {session && (
            <button
              style={styles.resetBtn}
              onClick={() => {
                if (confirm('¿Iniciar nueva sesión? Se perderá todo el progreso.')) {
                  startNewSession()
                }
              }}
            >
              Nueva sesión
            </button>
          )}
        </div>
      </nav>

      <main style={styles.main}>
        {phase === PHASES.SETUP && (
          <SetupPhase
            initialData={session}
            timerRunning={!!timerStart}
            onStartTimer={startTimer}
            onStart={(data) => {
              setSession(data)
              if (!sessionId) setSessionId(Date.now().toString())
              setPhase(PHASES.QUESTIONS)
            }}
          />
        )}

        {phase === PHASES.QUESTIONS && session && (
          <QuestionsPhase
            key={session.caseText}
            session={session}
            initialHistory={questionHistory}
            onComplete={(history) => {
              setQuestionHistory(history)
              setPhase(PHASES.EXPERTS)
              saveCurrentSession(null, false)
            }}
          />
        )}

        {phase === PHASES.EXPERTS && session && (
          <ExpertsPhase
            session={session}
            initialExperts={experts.length > 0 ? experts : undefined}
            onComplete={(expertData) => {
              setExperts(expertData)
              setPhase(PHASES.REVIEW)
              saveCurrentSession(null, false)
            }}
          />
        )}

        {phase === PHASES.REVIEW && session && (
          <ReviewPhase
            session={session}
            questionHistory={questionHistory}
            experts={experts}
            onConfirm={() => {
              setSynthesisKey(k => k + 1)
              setPhase(PHASES.SYNTHESIS)
            }}
            onBack={() => setPhase(PHASES.EXPERTS)}
          />
        )}

        {phase === PHASES.SYNTHESIS && session && (
          <SynthesisPhase
            key={synthesisKey}
            session={session}
            questionHistory={questionHistory}
            experts={experts}
            onDone={(plan) => {
              setPlanOutput(plan)
              saveCurrentSession(plan, true)
            }}
          />
        )}
      </main>
    </div>
  )
}

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: 'var(--bg)',
    overflow: 'hidden',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 32px',
    height: 64,
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
    flexShrink: 0,
  },
  brand: { display: 'flex', alignItems: 'center', gap: 12, lineHeight: 1.1 },
  homeBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text-muted)',
    borderRadius: 6,
    padding: 6,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  brandName: { fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'block' },
  brandSub: { fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' },
  stepper: { display: 'flex', alignItems: 'center', gap: 0 },
  step: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  stepDot: {
    width: 26, height: 26,
    borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, color: '#fff',
    fontFamily: 'var(--font-mono)',
    transition: 'all 0.3s',
  },
  stepLabel: { fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', transition: 'color 0.3s' },
  stepLine: { width: 48, height: 1, margin: '0 4px', marginBottom: 16, transition: 'background 0.3s' },
  navRight: { display: 'flex', alignItems: 'center', gap: 8 },
  backBtn: {
    display: 'flex', alignItems: 'center', gap: 4,
    background: 'none', border: '1px solid var(--border)',
    color: 'var(--text-muted)', borderRadius: 4,
    padding: '6px 12px', fontSize: 12, cursor: 'pointer',
  },
  resetBtn: {
    background: 'none', border: '1px solid var(--border)',
    color: 'var(--text-muted)', borderRadius: 4,
    padding: '6px 12px', fontSize: 12, cursor: 'pointer',
  },
  main: { flex: 1, overflowY: 'auto' },
}
