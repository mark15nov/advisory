// src/components/SetupPhase.jsx
import React, { useEffect, useRef, useState } from 'react'
import { ArrowRight, Building2, User, MapPin, Users, DollarSign, Calendar, Briefcase, Target, Star, Play, Clock, Mic, Square } from 'lucide-react'

const IS_DEV = import.meta.env.DEV
const SHOW_VOICE_BUTTONS = false

/** Textos de prueba que cumplen los mínimos de caracteres del formulario (solo desarrollo). */
const DEV_CASE_FIXTURE = {
  presenter: 'María Prueba López',
  role: 'Directora General',
  company: 'Empresa Demo S.A. de C.V.',
  industry: 'Servicios profesionales',
  location: 'Ciudad de México',
  employees: '11-50',
  revenue: '5-10 MDP',
  yearsInBusiness: '8',
  whatYouDo:
    'Consultoría y capacitación para pymes en procesos operativos y ventas, con enfoque en manufactura ligera y comercio.',
  differentiation:
    'Combinamos diagnóstico rápido en planta con acompañamiento quincenal; no vendemos paquetes genéricos sino rutas de mejora medibles. Nuestro equipo tiene experiencia mixta industria + retail y hablamos el lenguaje del dueño. Esto es texto de prueba para desarrollo.',
  caseText:
    'Necesitamos priorizar en qué invertir los próximos seis meses: abrir una segunda línea de producto o fortalecer la fuerza de ventas actual. Tenemos presión de flujo y un equipo pequeño; el consejo nos ayudaría a definir criterios, riesgos y un plan de acción concreto. Buscamos orientación práctica, no teoría. Este párrafo es contenido de prueba autogenerado para validar el flujo en desarrollo sin escribir el caso a mano cada vez; debe superar los doscientos caracteres requeridos por el formulario.',
}

function VoiceBlockedNotice() {
  const isWindows = typeof navigator !== 'undefined' && /win/i.test(navigator.platform)
  return (
    <div style={voiceBlockedStyles.wrap}>
      <span style={voiceBlockedStyles.icon}>🎙️</span>
      <div style={voiceBlockedStyles.body}>
        <span style={voiceBlockedStyles.title}>Dictado por voz no disponible en esta red</span>
        <span style={voiceBlockedStyles.desc}>
          El modelo de voz local no pudo descargarse (red restringida).
          {isWindows
            ? <> Usa el dictado nativo de Windows: haz clic en el campo de texto y presiona <kbd style={voiceBlockedStyles.kbd}>Win + H</kbd>.</>
            : <> Activa el dictado del sistema operativo sobre el campo de texto.</>}
        </span>
      </div>
    </div>
  )
}

const voiceBlockedStyles = {
  wrap: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 14px',
    marginTop: 4,
  },
  icon: { fontSize: 18, flexShrink: 0, marginTop: 1 },
  body: { display: 'flex', flexDirection: 'column', gap: 3 },
  title: { fontSize: 12, fontWeight: 600, color: 'var(--text)', letterSpacing: '0.02em' },
  desc: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55 },
  kbd: {
    display: 'inline-block',
    background: 'var(--surface-2, #f3f4f6)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '1px 6px',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text)',
    margin: '0 2px',
  },
}

export default function SetupPhase({
  onStart,
  initialData,
  timerRunning,
  onStartTimer,
  timerDurationMinutes = 90,
  onChangeTimerDuration,
}) {
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
  const [timerInput, setTimerInput] = useState(String(timerDurationMinutes))
  const [activeDictationField, setActiveDictationField] = useState(null)
  const [dictationError, setDictationError] = useState('')
  const [isLocalModelLoading, setIsLocalModelLoading] = useState(false)
  const [localModelBlocked, setLocalModelBlocked] = useState(false)
  const recognitionRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const audioChunksRef = useRef([])
  const localTranscriberRef = useRef(null)
  const loadingTranscriberPromiseRef = useRef(null)
  const dictationSetterRef = useRef(null)
  const dictationBaseTextRef = useRef('')
  const dictationFinalTextRef = useRef('')
  const activeDictationFieldRef = useRef(null)

  const speechRecognitionCtor =
    typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null
  const supportsSpeechToText = Boolean(speechRecognitionCtor)
  const supportsRecordedDictation =
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    Boolean(navigator?.mediaDevices?.getUserMedia)
  const supportsAnyDictation = supportsSpeechToText || supportsRecordedDictation

  // Mantiene activeDictationField en un ref para que los callbacks de recognition
  // siempre lean el valor actual sin stale-closure.
  function setActiveDictationFieldSync(value) {
    activeDictationFieldRef.current = value
    setActiveDictationField(value)
  }

  useEffect(() => {
    setTimerInput(String(timerDurationMinutes))
  }, [timerDurationMinutes])

  const canStart =
    presenter.trim() &&
    company.trim() &&
    industry.trim() &&
    whatYouDo.trim() &&
    differentiation.trim().length >= 100 &&
    caseText.trim().length >= 200

  function applyDevAutofill() {
    const d = DEV_CASE_FIXTURE
    setPresenter(d.presenter)
    setRole(d.role)
    setCompany(d.company)
    setIndustry(d.industry)
    setLocation(d.location)
    setEmployees(d.employees)
    setRevenue(d.revenue)
    setYearsInBusiness(d.yearsInBusiness)
    setWhatYouDo(d.whatYouDo)
    setDifferentiation(d.differentiation)
    setCaseText(d.caseText)
  }

  function commitTimerInput() {
    if (!timerInput.trim()) {
      setTimerInput(String(timerDurationMinutes))
      return
    }
    onChangeTimerDuration?.(timerInput)
  }

  function joinDictationText(base, chunk) {
    if (!base) return chunk || ''
    if (!chunk) return base
    if (/[\s\n]$/.test(base) || /^[,.;:!?]/.test(chunk)) return `${base}${chunk}`
    return `${base} ${chunk}`
  }

  function stopDictation() {
    // Detiene Web Speech si está activo
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch {}
      recognitionRef.current = null
    }
    // Detiene grabación local si está activa
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      return
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }
  }

  function resetDictationRefs() {
    dictationSetterRef.current = null
    dictationBaseTextRef.current = ''
    dictationFinalTextRef.current = ''
  }

  async function getLocalTranscriber() {
    if (localTranscriberRef.current) return localTranscriberRef.current
    if (!loadingTranscriberPromiseRef.current) {
      loadingTranscriberPromiseRef.current = (async () => {
        setIsLocalModelLoading(true)
        try {
          const { pipeline } = await import('@xenova/transformers')
          // Modelo pequeño para mantener tiempos de carga razonables en navegador.
          const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny')
          localTranscriberRef.current = transcriber
          return transcriber
        } catch (err) {
          const msg = String(err?.message || '')
          const looksLikeHtmlInsteadOfJson =
            msg.includes('JSON.parse') ||
            msg.includes("Unexpected token '<'") ||
            msg.includes('<!DOCTYPE')
          if (looksLikeHtmlInsteadOfJson) {
            setLocalModelBlocked(true)
            throw new Error('HUGGING_FACE_BLOCKED')
          }
          throw err
        }
      })()
        .finally(() => {
          setIsLocalModelLoading(false)
          loadingTranscriberPromiseRef.current = null
        })
    }
    return loadingTranscriberPromiseRef.current
  }

  async function decodeAudioBlobTo16kMono(audioBlob) {
    const arrayBuffer = await audioBlob.arrayBuffer()
    const audioContext = new AudioContext()
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0))

    const targetRate = 16000
    const offlineCtx = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetRate), targetRate)
    const source = offlineCtx.createBufferSource()
    source.buffer = decoded
    source.connect(offlineCtx.destination)
    source.start(0)
    const rendered = await offlineCtx.startRendering()
    await audioContext.close()
    return rendered.getChannelData(0)
  }

  async function transcribeAudioChunk({ fieldKey, currentValue, setter, audioBlob }) {
    const transcriber = await getLocalTranscriber()
    const mono16k = await decodeAudioBlobTo16kMono(audioBlob)
    const result = await transcriber(mono16k, {
      task: 'transcribe',
      language: 'spanish',
      chunk_length_s: 20,
      stride_length_s: 5,
      return_timestamps: false,
    })
    const transcript = String(result?.text || '').trim()
    if (!transcript) throw new Error('No se detectó voz en la grabación.')
    setter(joinDictationText(currentValue || '', transcript))
    setDictationError('')
    setActiveDictationField((prev) => (prev === fieldKey ? null : prev))
  }

  async function startRecordedDictation({ fieldKey, currentValue, setter }) {
    if (!supportsRecordedDictation) {
      setDictationError('Tu navegador no permite grabar audio para transcripción.')
      return
    }

    // Liberar stream anterior antes de pedir uno nuevo
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch {}
      mediaRecorderRef.current = null
    }

    setDictationError('')
    setActiveDictationFieldSync(fieldKey)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      audioChunksRef.current = []

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : ''
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) audioChunksRef.current.push(event.data)
      }

      recorder.onerror = () => {
        setDictationError('No se pudo grabar el audio. Intenta nuevamente.')
        setActiveDictationFieldSync(null)
      }

      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        audioChunksRef.current = []
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop())
          mediaStreamRef.current = null
        }
        mediaRecorderRef.current = null
        if (activeDictationFieldRef.current === fieldKey) setActiveDictationFieldSync(null)
        try {
          await transcribeAudioChunk({ fieldKey, currentValue, setter, audioBlob: blob })
        } catch (err) {
          if (String(err?.message || '') === 'HUGGING_FACE_BLOCKED') return
          setDictationError(
            err.message ||
            'No se pudo transcribir localmente. Verifica conexión para descargar el modelo o prueba en Chrome/Edge.'
          )
        }
      }

      recorder.start()
    } catch (err) {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop())
        mediaStreamRef.current = null
      }
      setActiveDictationFieldSync(null)
      const name = String(err?.name || '').toLowerCase()
      if (name.includes('notallowed') || name.includes('permissiondenied')) {
        setDictationError('No hay permiso de micrófono. Permítelo en el navegador e intenta de nuevo.')
      } else if (name.includes('notfound') || name.includes('devicenotfound')) {
        setDictationError('No se encontró micrófono en este dispositivo.')
      } else if (name.includes('notreadable') || name.includes('trackstarterror')) {
        setDictationError('El micrófono está siendo usado por otra app. Ciérrala e intenta de nuevo.')
      } else {
        setDictationError(`No se pudo iniciar la grabación (${err?.name || 'error desconocido'}).`)
      }
    }
  }

  function startSpeechRecognitionDictation({ fieldKey, currentValue, setter }) {
    if (!supportsSpeechToText) {
      setDictationError('Este navegador no soporta reconocimiento de voz en tiempo real.')
      return
    }

    // Cancelar cualquier recognition previo antes de crear uno nuevo
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch {}
      recognitionRef.current = null
    }

    const recognition = new speechRecognitionCtor()
    recognition.lang = 'es-MX'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    // Siempre resetear con el valor actual del campo que se está dictando
    dictationSetterRef.current = setter
    dictationBaseTextRef.current = currentValue || ''
    dictationFinalTextRef.current = ''
    recognitionRef.current = recognition
    setDictationError('')
    setActiveDictationFieldSync(fieldKey)

    recognition.onresult = (event) => {
      // Ignorar resultados de un recognition ya reemplazado
      if (recognitionRef.current !== recognition) return

      let interimChunk = ''
      let hasNewFinal = false
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = (event.results[i]?.[0]?.transcript || '').trim()
        if (!transcript) continue
        if (event.results[i].isFinal) {
          dictationFinalTextRef.current = joinDictationText(dictationFinalTextRef.current, transcript)
          hasNewFinal = true
        } else {
          interimChunk = joinDictationText(interimChunk, transcript)
        }
      }

      const composed = joinDictationText(
        joinDictationText(dictationBaseTextRef.current, dictationFinalTextRef.current),
        interimChunk
      )
      dictationSetterRef.current?.(composed)
      if (hasNewFinal) dictationBaseTextRef.current = composed
    }

    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return
      const code = String(event?.error || '')
      if (code === 'aborted') return
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setDictationError('No hay permiso de micrófono o de reconocimiento de voz. Revisa permisos del navegador.')
        return
      }
      if (code === 'audio-capture') {
        setDictationError('No se detecta micrófono disponible.')
        return
      }
      if (code === 'network') {
        setDictationError('Falló la conexión del servicio de dictado en vivo. Revisa internet e intenta de nuevo.')
        return
      }
      if (code === 'no-speech') {
        setDictationError('No se detectó voz. Acércate al micrófono y vuelve a intentar.')
        return
      }
      setDictationError('No se pudo transcribir el audio. Intenta nuevamente.')
    }

    recognition.onend = () => {
      // Solo limpiar estado si este recognition no fue ya reemplazado por otro
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null
        resetDictationRefs()
        if (activeDictationFieldRef.current === fieldKey) {
          setActiveDictationFieldSync(null)
        }
      }
    }

    recognition.start()
  }

  function startDictation(opts) {
    if (supportsSpeechToText) {
      startSpeechRecognitionDictation(opts)
      return
    }
    startRecordedDictation(opts)
  }

  useEffect(() => () => {
    if (recognitionRef.current) { try { recognitionRef.current.abort() } catch {} }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch {}
    }
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((track) => track.stop())
  }, [])

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
        <div style={styles.timerControl}>
          <div style={styles.timerConfigRow}>
            <label style={styles.timerConfigLabel} htmlFor="timer-duration-minutes">
              Duración de la sesión (min)
            </label>
            <input
              id="timer-duration-minutes"
              type="number"
              min={15}
              max={240}
              step={5}
              value={timerInput}
              onChange={(e) => setTimerInput(e.target.value)}
              onBlur={commitTimerInput}
              style={styles.timerConfigInput}
            />
          </div>
          <button
            style={styles.timerBtn}
            onClick={() => {
              commitTimerInput()
              onStartTimer()
            }}
          >
            <Play size={16} />
            Iniciar sesión ({timerDurationMinutes} min)
          </button>
        </div>
      ) : (
        <div style={styles.timerActive}>
          <Clock size={14} />
          Sesión en curso — el temporizador está corriendo
        </div>
      )}

      {IS_DEV && (
        <button
          type="button"
          style={styles.devAutofillBtn}
          onClick={applyDevAutofill}
        >
          Auto llenar formulario
        </button>
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
              <option value="<5 MDP">Menos de 5 MDP</option>
              <option value="5-10 MDP">5 a 10 MDP</option>
              <option value="11-50 MDP">11 a 50 MDP</option>
              <option value="51-100 MDP">51 a 100 MDP</option>
              <option value="100-200 MDP">100 a 200 MDP</option>
              <option value="200-500 MDP">200 a 500 MDP</option>
              <option value="500+ MDP">500 en adelante</option>
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
          {SHOW_VOICE_BUTTONS && (
            <>
              {(localModelBlocked && !supportsSpeechToText)
                ? <VoiceBlockedNotice />
                : (
                  <div style={styles.voiceRow}>
                    <button
                      type="button"
                      style={{ ...styles.voiceBtn, ...(activeDictationField === 'whatYouDo' ? styles.voiceBtnActive : {}) }}
                      onClick={() => {
                        if (activeDictationField === 'whatYouDo') stopDictation()
                        else startDictation({ fieldKey: 'whatYouDo', currentValue: whatYouDo, setter: setWhatYouDo })
                      }}
                      disabled={!supportsAnyDictation}
                    >
                      {activeDictationField === 'whatYouDo' ? <Square size={13} /> : <Mic size={13} />}
                      {activeDictationField === 'whatYouDo' ? 'Detener dictado' : 'Dictar respuesta'}
                    </button>
                    <span style={styles.voiceHint}>
                      {supportsSpeechToText
                        ? activeDictationField === 'whatYouDo'
                          ? 'Escuchando... habla con claridad'
                          : 'Puedes hablar en lugar de escribir'
                        : supportsRecordedDictation
                          ? activeDictationField === 'whatYouDo'
                            ? isLocalModelLoading
                              ? 'Cargando modelo local de voz...'
                              : 'Grabando audio... vuelve a presionar para transcribir'
                            : isLocalModelLoading
                              ? 'Preparando dictado local...'
                              : 'Graba tu voz y la convertimos a texto (local)'
                          : 'Dictado no disponible en este navegador'}
                    </span>
                  </div>
                )}
              {(!localModelBlocked || supportsSpeechToText) && dictationError && <span style={styles.voiceError}>{dictationError}</span>}
            </>
          )}
        </div>
        <div style={styles.field}>
          <label style={styles.label}>
            <Star size={14} style={{ marginRight: 6 }} />
            ¿Qué te diferencia de los demás? *
          </label>
          <textarea
            style={styles.textarea}
            placeholder="¿Qué hace única a tu empresa? ¿Por qué te eligen tus clientes sobre la competencia?"
            value={differentiation}
            onChange={e => setDifferentiation(e.target.value)}
            rows={3}
          />
          {SHOW_VOICE_BUTTONS && (
            <>
              {(localModelBlocked && !supportsSpeechToText)
                ? <VoiceBlockedNotice />
                : (
                  <div style={styles.voiceRow}>
                    <button
                      type="button"
                      style={{ ...styles.voiceBtn, ...(activeDictationField === 'differentiation' ? styles.voiceBtnActive : {}) }}
                      onClick={() => {
                        if (activeDictationField === 'differentiation') stopDictation()
                        else startDictation({ fieldKey: 'differentiation', currentValue: differentiation, setter: setDifferentiation })
                      }}
                      disabled={!supportsAnyDictation}
                    >
                      {activeDictationField === 'differentiation' ? <Square size={13} /> : <Mic size={13} />}
                      {activeDictationField === 'differentiation' ? 'Detener dictado' : 'Dictar respuesta'}
                    </button>
                    <span style={styles.voiceHint}>
                      {supportsSpeechToText
                        ? activeDictationField === 'differentiation'
                          ? 'Escuchando... habla con claridad'
                          : 'Puedes hablar en lugar de escribir'
                        : supportsRecordedDictation
                          ? activeDictationField === 'differentiation'
                            ? isLocalModelLoading
                              ? 'Cargando modelo local de voz...'
                              : 'Grabando audio... vuelve a presionar para transcribir'
                            : isLocalModelLoading
                              ? 'Preparando dictado local...'
                              : 'Graba tu voz y la convertimos a texto (local)'
                          : 'Dictado no disponible en este navegador'}
                    </span>
                  </div>
                )}
              {(!localModelBlocked || supportsSpeechToText) && dictationError && <span style={styles.voiceError}>{dictationError}</span>}
            </>
          )}
          <div style={styles.counterBlock}>
            <span style={styles.counter}>{differentiation.length}/100 mínimo</span>
            {differentiation.trim().length > 0 && differentiation.trim().length < 100 && (
              <span style={{ ...styles.counter, color: '#b45309' }}>
                Faltan {100 - differentiation.trim().length} caracteres para el mínimo.
              </span>
            )}
          </div>
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
          {SHOW_VOICE_BUTTONS && (
            <>
              {(localModelBlocked && !supportsSpeechToText)
                ? <VoiceBlockedNotice />
                : (
                  <div style={styles.voiceRow}>
                    <button
                      type="button"
                      style={{ ...styles.voiceBtn, ...(activeDictationField === 'caseText' ? styles.voiceBtnActive : {}) }}
                      onClick={() => {
                        if (activeDictationField === 'caseText') stopDictation()
                        else startDictation({ fieldKey: 'caseText', currentValue: caseText, setter: setCaseText })
                      }}
                      disabled={!supportsAnyDictation}
                    >
                      {activeDictationField === 'caseText' ? <Square size={13} /> : <Mic size={13} />}
                      {activeDictationField === 'caseText' ? 'Detener dictado' : 'Dictar respuesta'}
                    </button>
                    <span style={styles.voiceHint}>
                      {supportsSpeechToText
                        ? activeDictationField === 'caseText'
                          ? 'Escuchando... habla con claridad'
                          : 'Puedes hablar en lugar de escribir'
                        : supportsRecordedDictation
                          ? activeDictationField === 'caseText'
                            ? isLocalModelLoading
                              ? 'Cargando modelo local de voz...'
                              : 'Grabando audio... vuelve a presionar para transcribir'
                            : isLocalModelLoading
                              ? 'Preparando dictado local...'
                              : 'Graba tu voz y la convertimos a texto (local)'
                          : 'Dictado no disponible en este navegador'}
                    </span>
                  </div>
                )}
              {(!localModelBlocked || supportsSpeechToText) && dictationError && <span style={styles.voiceError}>{dictationError}</span>}
            </>
          )}
          <div style={styles.counterBlock}>
            <span style={styles.counter}>{caseText.length} caracteres (mínimo 200)</span>
            {caseText.trim().length > 0 && caseText.trim().length < 200 && (
              <span style={{ ...styles.counter, color: '#b45309' }}>
                Faltan {200 - caseText.trim().length} caracteres para el mínimo.
              </span>
            )}
          </div>
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
  voiceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  voiceBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    borderRadius: 6,
    padding: '8px 10px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  voiceBtnActive: {
    border: '1px solid var(--red)',
    color: 'var(--red)',
    background: 'rgba(198, 40, 40, 0.08)',
  },
  voiceHint: {
    fontSize: 11,
    color: 'var(--text-dim)',
  },
  voiceError: {
    fontSize: 11,
    color: 'var(--red)',
    marginTop: 2,
  },
  counterBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  counter: {
    fontSize: 11,
    color: 'var(--text-dim)',
    textAlign: 'right',
    lineHeight: 1.35,
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
  timerControl: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  timerConfigRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '8px 12px',
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface)',
  },
  timerConfigLabel: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.06em',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
  },
  timerConfigInput: {
    width: 110,
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '8px 10px',
    fontSize: 14,
    color: 'var(--text)',
    outline: 'none',
    textAlign: 'right',
    fontFamily: 'var(--font-mono)',
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
  devAutofillBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    background: 'var(--surface)',
    border: '1px dashed var(--border)',
    color: 'var(--text-muted)',
    borderRadius: 8,
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'border-color 0.2s, background 0.2s',
  },
}
