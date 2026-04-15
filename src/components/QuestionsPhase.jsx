// src/components/QuestionsPhase.jsx
import React, { useState, useEffect, useRef } from 'react'
import { ArrowRight, Loader2, MessageSquare, Pencil, Mic, MicOff, Plus } from 'lucide-react'
import { callClaude } from '../hooks/useClaude'
import { SYSTEM_PROMPTS } from '../lib/session'

/** Preguntas guía generadas por la IA antes de permitir extras o continuar. */
const MIN_AI_QUESTIONS = 5
const SHOW_VOICE_BUTTONS = false

/** Quita restos que a veces añade el modelo (sección de advisors del plan ejecutivo). */
function stripDiagnosticQuestionNoise(text) {
  if (!text || typeof text !== 'string') return ''
  let t = text.trim()
  t = t.replace(/\s*(\*{0,2}\s*)*(#{1,6}\s*)?ADVISORS\s+RECOMENDADOS[\s\S]*$/i, '')
  t = t.replace(/\s*---+[\s]*$/, '')
  return t.trim()
}

export default function QuestionsPhase({ session, onComplete, initialHistory }) {
  const hasInitial = initialHistory && initialHistory.length > 0
  // qa: array of { question, answer, source?: 'ai' | 'user' }
  const [qa, setQa] = useState(hasInitial ? initialHistory : [])
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingQuestion, setStreamingQuestion] = useState('')
  const [error, setError] = useState(null)
  const [editingIndex, setEditingIndex] = useState(null)
  const [editText, setEditText] = useState('')
  const [speechSupported, setSpeechSupported] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [speechError, setSpeechError] = useState(null)
  const [showOwnQuestionForm, setShowOwnQuestionForm] = useState(false)
  const [ownQuestionText, setOwnQuestionText] = useState('')
  const lastFailedQaRef = useRef(null)
  const bottomRef = useRef(null)
  const recognitionRef = useRef(null)

  const questionCount = qa.length
  const currentQa = qa[qa.length - 1]
  const waitingForAnswer = currentQa && !currentQa.answer && !loading
  const allAnswered =
    qa.length >= MIN_AI_QUESTIONS && qa.length > 0 && qa.every(item => item.answer)

  useEffect(() => {
    if (!hasInitial) fetchQuestion([])
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [qa, streamingQuestion])

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setSpeechSupported(false)
      return
    }

    setSpeechSupported(true)
    const recognition = new SR()
    recognition.lang = 'es-MX'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onstart = () => {
      setIsListening(true)
      setSpeechError(null)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognition.onerror = (event) => {
      if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
        setSpeechError('No se concedió permiso para usar el micrófono.')
      } else {
        setSpeechError('No fue posible transcribir la voz. Intenta nuevamente.')
      }
      setIsListening(false)
    }

    recognition.onresult = (event) => {
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (result.isFinal) finalText += `${result[0].transcript} `
      }
      const normalized = finalText.trim()
      if (!normalized) return
      setAnswer((prev) => {
        const base = prev.trimEnd()
        return base ? `${base} ${normalized}` : normalized
      })
    }

    recognitionRef.current = recognition
    return () => {
      recognition.onstart = null
      recognition.onend = null
      recognition.onerror = null
      recognition.onresult = null
      recognition.stop()
      recognitionRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!waitingForAnswer && isListening) {
      recognitionRef.current?.stop()
    }
  }, [waitingForAnswer, isListening])

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
          content: `Pregunta ${questionNumber} de ${MIN_AI_QUESTIONS}. Haz la siguiente pregunta estratégica basándote en mis respuestas anteriores.`,
        })
      }

      let streamed = ''
      await callClaude({
        system: SYSTEM_PROMPTS.questionGuide,
        messages,
        skipAdvisoryContext: true,
        onChunk: (chunk) => {
          streamed += chunk
          setStreamingQuestion(streamed)
        },
      })

      const cleaned = stripDiagnosticQuestionNoise(streamed)
      const newQa = [...currentQa, { question: cleaned, answer: null, source: 'ai' }]
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
    if (isListening) recognitionRef.current?.stop()
    const text = answer.trim()
    setAnswer('')

    // Update the last qa pair with the answer
    const updatedQa = qa.map((item, i) =>
      i === qa.length - 1 ? { ...item, answer: text } : item
    )
    setQa(updatedQa)

    if (updatedQa.length < MIN_AI_QUESTIONS) {
      await fetchQuestion(updatedQa)
    }
  }

  function cancelOwnQuestionForm() {
    setShowOwnQuestionForm(false)
    setOwnQuestionText('')
  }

  function submitOwnQuestion() {
    const text = ownQuestionText.trim()
    if (!text) return
    setQa((prev) => [...prev, { question: text, answer: null, source: 'user' }])
    cancelOwnQuestionForm()
  }

  function questionRoleLabel(item, index) {
    if (item.source === 'user') {
      const n = index - MIN_AI_QUESTIONS + 1
      return `PRESENTADOR — PREGUNTA ADICIONAL ${n}`
    }
    return `CONSEJO IA — PREGUNTA ${index + 1}`
  }

  function toggleVoiceInput() {
    if (!speechSupported || !recognitionRef.current) return
    setSpeechError(null)
    if (isListening) {
      recognitionRef.current.stop()
      return
    }
    try {
      recognitionRef.current.start()
    } catch {
      setSpeechError('No fue posible iniciar el micrófono. Verifica permisos del navegador.')
    }
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
            {[...Array(MIN_AI_QUESTIONS)].map((_, i) => (
              <div key={i} style={{
                ...styles.dot,
                background: i < questionCount ? 'var(--gold)' : 'var(--border)',
              }} />
            ))}
          </div>
          <div style={styles.progressCount}>
            {Math.min(questionCount, MIN_AI_QUESTIONS)} / {MIN_AI_QUESTIONS}
            {questionCount > MIN_AI_QUESTIONS && (
              <span style={styles.progressExtra}>
                {' '}
                · +{questionCount - MIN_AI_QUESTIONS} propia
                {questionCount - MIN_AI_QUESTIONS !== 1 ? 's' : ''}
              </span>
            )}
          </div>
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
            <div
              style={{
                ...styles.questionBubble,
                ...(item.source === 'user' ? styles.questionBubbleUser : null),
              }}
            >
              <span style={styles.roleTag}>{questionRoleLabel(item, i)}</span>
              <p style={styles.questionText}>{stripDiagnosticQuestionNoise(item.question)}</p>
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
              <span style={styles.roleTag}>CONSEJO IA — PREGUNTA {Math.min(questionCount + 1, MIN_AI_QUESTIONS)}</span>
              <p style={styles.questionText}>{stripDiagnosticQuestionNoise(streamingQuestion)}<span style={styles.cursor}>|</span></p>
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
            <div style={styles.inputActionsLeft}>
              <span style={styles.hint}>⌘ + Enter para enviar</span>
              {SHOW_VOICE_BUTTONS && (
                <button
                  type="button"
                  style={{
                    ...styles.micBtn,
                    ...(isListening ? styles.micBtnActive : null),
                    ...(!speechSupported ? styles.micBtnDisabled : null),
                  }}
                  onClick={toggleVoiceInput}
                  disabled={!speechSupported}
                  title={speechSupported ? 'Dictar respuesta con voz' : 'Tu navegador no soporta reconocimiento de voz'}
                >
                  {isListening ? <MicOff size={14} /> : <Mic size={14} />}
                  {speechSupported
                    ? (isListening ? 'Detener micrófono' : 'Responder con voz')
                    : 'Voz no disponible'}
                </button>
              )}
            </div>
            <button
              style={{ ...styles.btn, opacity: answer.trim() ? 1 : 0.4 }}
              onClick={handleAnswer}
              disabled={!answer.trim()}
            >
              Enviar respuesta <ArrowRight size={15} />
            </button>
          </div>
          {speechError && <span style={styles.speechError}>{speechError}</span>}
        </div>
      )}

      {/* Tras el núcleo de la IA (y cualquier extra respondida): añadir pregunta propia o continuar */}
      {allAnswered && !loading && (
        <div style={styles.inputArea}>
          {showOwnQuestionForm ? (
            <div style={styles.ownQuestionBox}>
              <label style={styles.ownQuestionLabel} htmlFor="own-diagnostic-q">
                Tu pregunta para el presentador
              </label>
              <textarea
                id="own-diagnostic-q"
                style={styles.textarea}
                placeholder="Formula la pregunta que quieres incorporar al diagnóstico…"
                value={ownQuestionText}
                onChange={(e) => setOwnQuestionText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitOwnQuestion()
                  if (e.key === 'Escape') cancelOwnQuestionForm()
                }}
                rows={3}
                autoFocus
              />
              <div style={styles.ownQuestionActions}>
                <button type="button" style={styles.btnSecondary} onClick={cancelOwnQuestionForm}>
                  Cancelar
                </button>
                <button
                  type="button"
                  style={{ ...styles.btn, opacity: ownQuestionText.trim() ? 1 : 0.4 }}
                  onClick={submitOwnQuestion}
                  disabled={!ownQuestionText.trim()}
                >
                  Añadir pregunta <Plus size={15} />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              style={styles.btnSecondary}
              onClick={() => setShowOwnQuestionForm(true)}
            >
              <Plus size={15} />
              Agregar pregunta propia
            </button>
          )}
          <button type="button" style={styles.btn} onClick={() => onComplete(qa)}>
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
  progressExtra: { color: 'var(--text-muted)' },
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
  caseText: {
    fontSize: 13,
    color: 'var(--text-muted)',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
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
  questionBubbleUser: {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
  },
  roleTag: {
    fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
    color: 'var(--gold)', textTransform: 'uppercase',
  },
  questionText: {
    fontSize: 15,
    color: 'var(--text)',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
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
  answerText: {
    fontSize: 14,
    color: 'var(--text)',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
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
    color: '#fff',
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
  inputActionsLeft: {
    display: 'flex', alignItems: 'center', gap: 10,
  },
  hint: { fontSize: 12, color: 'var(--text-dim)' },
  micBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '8px 10px',
    fontSize: 12,
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  micBtnActive: {
    border: '1px solid var(--gold)',
    color: 'var(--gold)',
    background: 'var(--gold-dim)',
  },
  micBtnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  speechError: {
    fontSize: 12,
    color: 'var(--red, #dc3c3c)',
  },
  btn: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'var(--gold)', color: '#fff',
    border: 'none', borderRadius: 6,
    padding: '10px 20px', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', transition: 'opacity 0.2s',
    justifyContent: 'center',
  },
  btnSecondary: {
    display: 'flex', alignItems: 'center', gap: 8,
    justifyContent: 'center',
    background: 'transparent',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '10px 20px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'border-color 0.2s, color 0.2s',
  },
  ownQuestionBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 4,
  },
  ownQuestionLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
  },
  ownQuestionActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flexWrap: 'wrap',
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
