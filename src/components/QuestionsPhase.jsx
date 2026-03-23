// src/components/QuestionsPhase.jsx
import React, { useState, useEffect, useRef } from 'react'
import { ArrowRight, Loader2, MessageSquare, Pencil } from 'lucide-react'
import { callClaude } from '../hooks/useClaude'
import { SYSTEM_PROMPTS } from '../lib/session'

const TOTAL_QUESTIONS = 5

export default function QuestionsPhase({ session, onComplete, initialHistory }) {
  const hasInitial = initialHistory && initialHistory.length > 0
  // qa: array of { question, answer } pairs
  const [qa, setQa] = useState(hasInitial ? initialHistory : [])
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingQuestion, setStreamingQuestion] = useState('')
  const [error, setError] = useState(null)
  const [editingIndex, setEditingIndex] = useState(null)
  const [editText, setEditText] = useState('')
  const lastFailedQaRef = useRef(null)
  const bottomRef = useRef(null)

  const questionCount = qa.length
  const currentQa = qa[qa.length - 1]
  const waitingForAnswer = currentQa && !currentQa.answer && !loading
  const allAnswered = qa.length >= TOTAL_QUESTIONS && qa.every(item => item.answer)

  useEffect(() => {
    if (!hasInitial) fetchQuestion([])
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [qa, streamingQuestion])

  function buildCompanyContext() {
    return [
      session.company && `Empresa: ${session.company}`,
      session.industry && `Industria: ${session.industry}`,
      session.role && `Cargo del presentador: ${session.role}`,
      session.location && `Ubicación: ${session.location}`,
      session.yearsInBusiness && `Años operando: ${session.yearsInBusiness}`,
      session.employees && `Empleados: ${session.employees}`,
      session.revenue && `Facturación anual: ${session.revenue}`,
      session.whatYouDo && `A qué se dedica: ${session.whatYouDo}`,
      session.differentiation && `Diferenciación: ${session.differentiation}`,
    ].filter(Boolean).join('\n')
  }

  function buildMessages(currentQa) {
    const intro = {
      role: 'user',
      content: `El caso presentado por ${session.presenter}:\n\n${buildCompanyContext()}\n\nCASO:\n"${session.caseText}"\n\nHaz tu primera pregunta estratégica para profundizar el caso.`,
    }

    const msgs = [intro]

    for (const item of currentQa) {
      msgs.push({ role: 'assistant', content: item.question })
      if (item.answer) {
        msgs.push({ role: 'user', content: item.answer })
      }
    }

    return msgs
  }

  async function fetchQuestion(currentQa) {
    setLoading(true)
    setStreamingQuestion('')

    try {
      const questionNumber = currentQa.length + 1
      const messages = buildMessages(currentQa)

      // If not the first question, add instruction for next question
      if (currentQa.length > 0) {
        messages.push({
          role: 'user',
          content: `Pregunta ${questionNumber} de ${TOTAL_QUESTIONS}. Haz la siguiente pregunta estratégica basándote en mis respuestas anteriores.`,
        })
      }

      let streamed = ''
      await callClaude({
        system: SYSTEM_PROMPTS.questionGuide,
        messages,
        onChunk: (chunk) => {
          streamed += chunk
          setStreamingQuestion(streamed)
        },
      })

      const newQa = [...currentQa, { question: streamed, answer: null }]
      setQa(newQa)
      setStreamingQuestion('')
      setError(null)
    } catch (e) {
      console.error('Error fetching question:', e)
      lastFailedQaRef.current = currentQa
      setError(e.message || 'Error al obtener la pregunta. Intenta de nuevo.')
    }
    setLoading(false)
  }

  async function handleAnswer() {
    if (!answer.trim()) return
    const text = answer.trim()
    setAnswer('')

    // Update the last qa pair with the answer
    const updatedQa = qa.map((item, i) =>
      i === qa.length - 1 ? { ...item, answer: text } : item
    )
    setQa(updatedQa)

    // If we've completed all questions, move to next phase
    if (updatedQa.length >= TOTAL_QUESTIONS) {
      onComplete(updatedQa)
      return
    }

    // Otherwise, fetch next question
    await fetchQuestion(updatedQa)
  }

  function startEditing(index) {
    setEditingIndex(index)
    setEditText(qa[index].answer)
  }

  function cancelEditing() {
    setEditingIndex(null)
    setEditText('')
  }

  function saveEdit() {
    if (!editText.trim()) return
    const updatedQa = qa.map((item, i) =>
      i === editingIndex ? { ...item, answer: editText.trim() } : item
    )
    setQa(updatedQa)
    setEditingIndex(null)
    setEditText('')
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.topBar}>
        <div style={styles.caseInfo}>
          <span style={styles.presenter}>{session.presenter}</span>
          {session.company && <span style={styles.company}> · {session.company}</span>}
        </div>
        <div style={styles.progress}>
          <div style={styles.progressLabel}>Preguntas de diagnóstico</div>
          <div style={styles.dots}>
            {[...Array(TOTAL_QUESTIONS)].map((_, i) => (
              <div key={i} style={{
                ...styles.dot,
                background: i < questionCount ? 'var(--gold)' : 'var(--border)',
              }} />
            ))}
          </div>
          <div style={styles.progressCount}>{questionCount} / {TOTAL_QUESTIONS}</div>
        </div>
      </div>

      {/* Case Summary */}
      <div style={styles.caseSummary}>
        <div style={styles.caseLabel}>
          <MessageSquare size={13} />
          CASO PRESENTADO
        </div>
        <p style={styles.caseText}>{session.caseText}</p>
      </div>

      {/* Q&A History */}
      <div style={styles.qaList}>
        {qa.map((item, i) => (
          <div key={i} style={styles.qaBlock}>
            <div style={styles.questionBubble}>
              <span style={styles.roleTag}>CONSEJO IA — PREGUNTA {i + 1}</span>
              <p style={styles.questionText}>{item.question}</p>
            </div>
            {item.answer && editingIndex === i ? (
              <div style={{ ...styles.answerBubble, borderColor: 'var(--gold)' }}>
                <span style={styles.roleTagUser}>{session.presenter} — EDITANDO</span>
                <textarea
                  style={styles.editTextarea}
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit()
                    if (e.key === 'Escape') cancelEditing()
                  }}
                  rows={3}
                  autoFocus
                />
                <div style={styles.editActions}>
                  <button style={styles.editBtnCancel} onClick={cancelEditing}>
                    Cancelar
                  </button>
                  <button
                    style={{ ...styles.editBtnSave, opacity: editText.trim() ? 1 : 0.4 }}
                    onClick={saveEdit}
                    disabled={!editText.trim()}
                  >
                    Guardar
                  </button>
                </div>
              </div>
            ) : item.answer ? (
              <div
                style={styles.answerBubble}
                className="answer-bubble"
                onClick={() => startEditing(i)}
              >
                <div style={styles.answerHeader}>
                  <span style={styles.roleTagUser}>{session.presenter}</span>
                  <span className="edit-hint" style={styles.editHint}>
                    <Pencil size={11} /> Editar
                  </span>
                </div>
                <p style={styles.answerText}>{item.answer}</p>
              </div>
            ) : null}
          </div>
        ))}

        {/* Streaming question */}
        {streamingQuestion && (
          <div style={styles.qaBlock}>
            <div style={{ ...styles.questionBubble, borderColor: 'var(--gold)', opacity: 0.85 }}>
              <span style={styles.roleTag}>CONSEJO IA — PREGUNTA {questionCount + 1}</span>
              <p style={styles.questionText}>{streamingQuestion}<span style={styles.cursor}>|</span></p>
            </div>
          </div>
        )}

        {loading && !streamingQuestion && (
          <div style={styles.thinking}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            <span>Preparando siguiente pregunta...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Error Banner */}
      {error && (
        <div style={styles.errorBanner}>
          <span style={styles.errorText}>{error}</span>
          <button
            style={styles.retryBtn}
            onClick={() => {
              const retryQa = lastFailedQaRef.current
              setError(null)
              if (retryQa !== null) fetchQuestion(retryQa)
            }}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Answer Input */}
      {waitingForAnswer && (
        <div style={styles.inputArea}>
          <textarea
            style={styles.textarea}
            placeholder="Escribe la respuesta del presentador..."
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAnswer() }}
            rows={3}
            autoFocus
          />
          <div style={styles.inputActions}>
            <span style={styles.hint}>⌘ + Enter para enviar</span>
            <button
              style={{ ...styles.btn, opacity: answer.trim() ? 1 : 0.4 }}
              onClick={handleAnswer}
              disabled={!answer.trim()}
            >
              Enviar respuesta <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Continue button when all questions are answered (returning from a later step) */}
      {allAnswered && !loading && (
        <div style={styles.inputArea}>
          <button
            style={styles.btn}
            onClick={() => onComplete(qa)}
          >
            Continuar al consejo <ArrowRight size={15} />
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        .answer-bubble { cursor: pointer; transition: border-color 0.2s; }
        .answer-bubble:hover { border-color: var(--gold) !important; }
        .answer-bubble .edit-hint { opacity: 0; transition: opacity 0.2s; }
        .answer-bubble:hover .edit-hint { opacity: 1; }
      `}</style>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    maxWidth: 800,
    margin: '0 auto',
    padding: '0 24px',
    gap: 0,
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 0',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  caseInfo: { display: 'flex', alignItems: 'center' },
  presenter: { fontSize: 15, fontWeight: 600, color: 'var(--text)' },
  company: { fontSize: 14, color: 'var(--text-muted)' },
  progress: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 },
  progressLabel: { fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase' },
  progressCount: { fontSize: 11, color: 'var(--text-dim)' },
  dots: { display: 'flex', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: '50%', transition: 'background 0.3s' },
  caseSummary: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '14px 16px',
    margin: '16px 0',
    flexShrink: 0,
  },
  caseLabel: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
    color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8,
  },
  caseText: { fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 },
  qaList: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    padding: '16px 0',
  },
  qaBlock: { display: 'flex', flexDirection: 'column', gap: 10 },
  questionBubble: {
    background: 'var(--gold-dim)',
    border: '1px solid rgba(201,168,76,0.25)',
    borderRadius: 8,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  roleTag: {
    fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
    color: 'var(--gold)', textTransform: 'uppercase',
  },
  questionText: { fontSize: 15, color: 'var(--text)', lineHeight: 1.6 },
  answerBubble: {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '14px 16px',
    marginLeft: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  answerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roleTagUser: {
    fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
    color: 'var(--text-muted)', textTransform: 'uppercase',
  },
  editHint: {
    display: 'flex', alignItems: 'center', gap: 4,
    fontSize: 11, color: 'var(--gold)', cursor: 'pointer',
  },
  answerText: { fontSize: 14, color: 'var(--text)', lineHeight: 1.6 },
  editTextarea: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '10px 12px',
    fontSize: 14,
    color: 'var(--text)',
    outline: 'none',
    resize: 'vertical',
    lineHeight: 1.6,
    width: '100%',
    boxSizing: 'border-box',
  },
  editActions: {
    display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
  },
  editBtnCancel: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 5,
    padding: '6px 14px',
    fontSize: 12,
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  editBtnSave: {
    background: 'var(--gold)',
    border: 'none',
    borderRadius: 5,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    color: '#0c0c0e',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  cursor: {
    display: 'inline-block',
    animation: 'blink 1s infinite',
    color: 'var(--gold)',
    marginLeft: 2,
  },
  thinking: {
    display: 'flex', alignItems: 'center', gap: 8,
    color: 'var(--text-dim)', fontSize: 13, padding: '8px 0',
  },
  inputArea: {
    borderTop: '1px solid var(--border)',
    padding: '16px 0 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    flexShrink: 0,
  },
  textarea: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '12px 14px',
    fontSize: 14,
    color: 'var(--text)',
    outline: 'none',
    resize: 'none',
    lineHeight: 1.6,
    width: '100%',
  },
  inputActions: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  hint: { fontSize: 12, color: 'var(--text-dim)' },
  btn: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'var(--gold)', color: '#0c0c0e',
    border: 'none', borderRadius: 6,
    padding: '10px 20px', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', transition: 'opacity 0.2s',
  },
  errorBanner: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12,
    background: 'var(--red-dim, rgba(220,60,60,0.1))',
    border: '1px solid var(--red, #dc3c3c)',
    borderRadius: 8,
    padding: '12px 16px',
    flexShrink: 0,
  },
  errorText: {
    fontSize: 13,
    color: 'var(--red, #dc3c3c)',
    lineHeight: 1.4,
    flex: 1,
  },
  retryBtn: {
    background: 'var(--red, #dc3c3c)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 16px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
}
