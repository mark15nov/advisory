// src/components/SynthesisPhase.jsx
import React, { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Loader2, Sparkles, Printer, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { callClaude } from '../hooks/useClaude'
import { authedFetch } from '../lib/authedFetch'
import { SYSTEM_PROMPTS } from '../lib/session'

const markdownComponents = {
  p: ({ children }) => <p className="plan-para plan-markdown-p">{children}</p>,
  ul: ({ children }) => <ul className="plan-markdown-ul">{children}</ul>,
  ol: ({ children }) => <ol className="plan-markdown-ol">{children}</ol>,
  li: ({ children }) => <li className="plan-markdown-li">{children}</li>,
  h1: ({ children }) => <h4 className="plan-md-heading">{children}</h4>,
  h2: ({ children }) => <h4 className="plan-md-heading">{children}</h4>,
  h3: ({ children }) => <h4 className="plan-md-heading">{children}</h4>,
  h4: ({ children }) => <h5 className="plan-md-heading-sm">{children}</h5>,
  h5: ({ children }) => <h5 className="plan-md-heading-sm">{children}</h5>,
  h6: ({ children }) => <h6 className="plan-md-heading-sm">{children}</h6>,
  strong: ({ children }) => <strong className="plan-md-strong">{children}</strong>,
  em: ({ children }) => <em className="plan-md-em">{children}</em>,
  a: ({ href, children }) => (
    <a className="plan-md-a" href={href} target="_blank" rel="noopener noreferrer">{children}</a>
  ),
  blockquote: ({ children }) => <blockquote className="plan-md-bq">{children}</blockquote>,
  code: ({ className, children, ...props }) => {
    const inline = !className
    if (inline) return <code className="plan-md-code-inline">{children}</code>
    return (
      <pre className="plan-md-pre">
        <code className={className}>{children}</code>
      </pre>
    )
  },
  table: ({ children }) => (
    <div className="plan-table-wrapper plan-md-table-wrap">
      <table className="plan-table plan-md-table">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => <th>{children}</th>,
  td: ({ children }) => <td>{children}</td>,
  hr: () => <hr className="plan-md-hr" />,
}

function normCompanyHeadingText(s) {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[–—−]/g, '-')
}

function lineMatchesCompanyHeading(line, companyNorm) {
  if (!companyNorm) return false
  const raw = line.trim()
  const stripMd = (t) => t.replace(/\*\*/g, '').replace(/#+\s*$/, '').trim()

  const hm = raw.match(/^#{1,6}\s+(.+)$/)
  if (hm) {
    const inner = normCompanyHeadingText(stripMd(hm[1]))
    if (inner === companyNorm) return true
    if (companyNorm.length >= 3 && inner.startsWith(`${companyNorm} -`)) return true
    return false
  }

  const boldm = raw.match(/^\*\*(.+)\*\*\s*$/)
  if (boldm) {
    const inner = normCompanyHeadingText(boldm[1])
    if (inner === companyNorm) return true
    if (companyNorm.length >= 3 && inner.startsWith(`${companyNorm} -`)) return true
    return false
  }

  const plain = normCompanyHeadingText(stripMd(raw))
  if (plain === companyNorm) return true
  if (companyNorm.length >= 3 && plain.startsWith(`${companyNorm} -`)) return true
  return false
}

/**
 * Extrae el contenido de la sección ## ADVISORS RECOMENDADOS del markdown completo.
 */
function extractAdvisorsSection(text) {
  if (!text) return ''
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let inSection = false
  const sectionLines = []
  for (const line of lines) {
    const m = line.match(/^#{1,2}\s+(.+)$/)
    if (m) {
      const t = m[1].trim().toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      if (t === 'ADVISORS RECOMENDADOS') {
        inSection = true
        continue
      } else if (inSection) {
        break
      }
    }
    if (inSection) sectionLines.push(line)
  }
  return sectionLines.join('\n').trim()
}

/**
 * Parsea el bloque de texto de ADVISORS RECOMENDADOS y devuelve un mapa
 * normalizado_nombre → { ajuste, especialidad, justificacion }.
 */
function parseAdvisorsFromMarkdown(content) {
  if (!content?.trim()) return {}
  const normName = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\*\*/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let current = null
  for (const line of lines) {
    const m = line.match(/^\d+\.\s+(.+)/)
    if (m) {
      if (current) blocks.push(current)
      current = { header: m[1], subLines: [] }
    } else if (current) {
      current.subLines.push(line)
    }
  }
  if (current) blocks.push(current)

  const result = {}
  for (const block of blocks) {
    const headerClean = block.header.replace(/\*\*/g, '').trim()
    const ajusteInHeader = headerClean.match(/[—–\-]\s*Ajuste\s*[:.]?\s*(\w+)/i)
    const nombre = headerClean.replace(/\s*[—–\-]\s*Ajuste.*$/i, '').trim()
    let ajuste = ajusteInHeader ? ajusteInHeader[1].toUpperCase() : ''
    let especialidad = ''
    let justificacion = ''

    const allLines = [block.header, ...block.subLines].map((l) =>
      l.replace(/^[\s\-*•]+/, '').trim()
    )
    // Acumula líneas de justificación (puede ser multi-línea)
    const justLines = []
    let inJust = false
    for (const l of allLines) {
      if (/especialidad\s+clave\s*:/i.test(l)) {
        inJust = false
        especialidad = l.replace(/especialidad\s+clave\s*:\s*/i, '').replace(/\*\*/g, '').trim()
      } else if (/justificaci[oó]n\s*:/i.test(l)) {
        inJust = true
        const first = l.replace(/justificaci[oó]n\s*:\s*/i, '').replace(/\*\*/g, '').trim()
        if (first) justLines.push(first)
      } else if (!ajuste && /ajuste\s*[:.]?\s*(alto|medio)/i.test(l)) {
        inJust = false
        const am = l.match(/ajuste\s*[:.]?\s*(alto|medio)/i)
        if (am) ajuste = am[1].toUpperCase()
      } else if (inJust && l) {
        // continúa acumulando líneas del bloque de justificación
        justLines.push(l.replace(/\*\*/g, '').trim())
      }
    }
    justificacion = justLines.join(' ').trim()

    // Si no se encontró una justificación etiquetada, usar todo el contenido de sub-líneas
    if (!justificacion && block.subLines.length > 0) {
      justificacion = block.subLines
        .map((l) => l.replace(/^[\s\-*•◦]+/, '').replace(/\*\*/g, '').trim())
        .filter((l) => l && !/^ajuste\s*[:.]?\s*(alto|medio)/i.test(l) && !/^especialidad\s+clave\s*:/i.test(l))
        .join(' ')
        .trim()
    }

    if (nombre) {
      result[normName(nombre)] = { nombre, ajuste, especialidad, justificacion }
    }
  }
  return result
}

/** Quita título duplicado de empresa al inicio del markdown (sección Plan de acción). */
function stripRedundantCompanyHeadingMarkdown(markdown, company) {
  if (!markdown?.trim() || !company?.trim()) return markdown
  const companyNorm = normCompanyHeadingText(company)
  if (!companyNorm) return markdown

  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i++
  if (i >= lines.length) return markdown
  if (!lineMatchesCompanyHeading(lines[i], companyNorm)) return markdown

  i++
  while (i < lines.length && lines[i].trim() === '') i++
  if (i < lines.length && /^(\*{3,}|-{3,}|_{3,})\s*$/.test(lines[i].trim())) i++

  const rest = lines.slice(i).join('\n').trim()
  return rest.length ? rest : markdown
}

function buildAdvisorHelpFallback({ fitSummary, especialidad }) {
  const fit = String(fitSummary || '').trim()
  const specialty = String(especialidad || '').trim()
  if (!fit && !specialty) return null

  if (fit) {
    // Reencuadra el resumen de encaje para responder "cómo ayuda" de forma práctica.
    return `Puede ayudarte en este caso porque ${fit.charAt(0).toLowerCase()}${fit.slice(1)}`
  }
  return `Puede ayudarte en este caso desde su especialidad en ${specialty}.`
}

export default function SynthesisPhase({ session, questionHistory, experts, onDone, initialPlanOutput }) {
  const cachedPlanAtMount =
    typeof initialPlanOutput === 'string' && initialPlanOutput.trim() ? initialPlanOutput.trim() : ''
  const [output, setOutput] = useState(() => cachedPlanAtMount)
  const [done, setDone] = useState(() => Boolean(cachedPlanAtMount))
  const [currentSlide, setCurrentSlide] = useState(0)
  const [directoryAdvisors, setDirectoryAdvisors] = useState([])
  const [directoryStatus, setDirectoryStatus] = useState('loading')
  /** Evita re-ejecutar el efecto cuando el padre asigna planOutput tras generar (mismo mount). */
  const initialPlanRef = useRef(initialPlanOutput)
  initialPlanRef.current = initialPlanOutput

  useEffect(() => {
    let cancelled = false
    const profile = {
      company: session.company || '',
      industry: session.industry || '',
      location: session.location || '',
      role: session.role || '',
      caseText: session.caseText || '',
      whatYouDo: session.whatYouDo || '',
      differentiation: session.differentiation || '',
    }
    setDirectoryStatus('loading')
    ;(async () => {
      let list = []
      try {
        const r = await authedFetch('/api/advisory-recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profile),
        })
        if (cancelled) return
        if (!r.ok) {
          setDirectoryAdvisors([])
          setDirectoryStatus('error')
        } else {
          const data = await r.json()
          list = Array.isArray(data.candidates) ? data.candidates : []
          setDirectoryAdvisors(list)
          setDirectoryStatus(list.length ? 'ok' : 'empty')
        }
      } catch {
        if (!cancelled) {
          setDirectoryAdvisors([])
          setDirectoryStatus('error')
        }
      }
      if (cancelled) return
      const cached =
        typeof initialPlanRef.current === 'string' && initialPlanRef.current.trim()
          ? initialPlanRef.current.trim()
          : ''
      if (cached) {
        if (!cancelled) {
          setOutput(cached)
          setDone(true)
        }
        return
      }
      await generate(list, () => cancelled)
    })()
    return () => { cancelled = true }
  }, [
    session.company,
    session.industry,
    session.location,
    session.role,
    session.caseText,
    session.whatYouDo,
    session.differentiation,
  ])

  async function generate(advisoryCandidatesFromClient, isCancelled) {
    const currentYear = new Date().getFullYear()
    const expertSummary = experts
      .filter(e => e.name && e.opinion)
      .map(e => `**${e.name}${e.role ? ` (${e.role})` : ''}:** ${e.opinion}`)
      .join('\n\n')

    const qaTranscript = questionHistory
      .map((item, i) => `PREGUNTA ${i + 1}: ${item.question}\nRESPUESTA: ${item.answer}`)
      .join('\n\n')

    const companyContext = [
      session.company && `Empresa: ${session.company}`,
      session.industry && `Industria: ${session.industry}`,
      session.role && `Cargo: ${session.role}`,
      session.location && `Ubicación: ${session.location}`,
      session.yearsInBusiness && `Años operando: ${session.yearsInBusiness}`,
      session.employees && `Empleados: ${session.employees}`,
      session.revenue && `Facturación: ${session.revenue}`,
      session.whatYouDo && `Se dedica a: ${session.whatYouDo}`,
      session.differentiation && `Diferenciación: ${session.differentiation}`,
    ].filter(Boolean).join(' | ')

    const prompt = `## CASO PRESENTADO
Presentador: ${session.presenter} | ${companyContext}
Fecha de referencia: ${currentYear}

Problema: ${session.caseText}

## SESIÓN DE PREGUNTAS Y RESPUESTAS
${qaTranscript}

## OPINIONES DEL CONSEJO
${expertSummary}

---
Genera el plan de acción ejecutivo completo basado en todo lo anterior.`

    let streamed = ''
    await callClaude({
      system: SYSTEM_PROMPTS.synthesis,
      messages: [{ role: 'user', content: prompt }],
      advisoryProfile: {
        company: session.company || '',
        industry: session.industry || '',
        location: session.location || '',
        role: session.role || '',
        caseText: session.caseText || '',
        whatYouDo: session.whatYouDo || '',
        differentiation: session.differentiation || '',
      },
      advisoryCandidatesFromClient,
      onChunk: (chunk) => {
        streamed += chunk
        if (!isCancelled?.()) setOutput(streamed)
      },
    })
    if (isCancelled?.()) return
    try {
      const profileWithPlan = {
        company: session.company || '',
        industry: session.industry || '',
        location: session.location || '',
        role: session.role || '',
        caseText: session.caseText || '',
        whatYouDo: session.whatYouDo || '',
        differentiation: session.differentiation || '',
        planText: streamed || '',
      }
      const rr = await authedFetch('/api/advisory-recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileWithPlan),
      })
      if (!isCancelled?.() && rr.ok) {
        const data = await rr.json()
        const list = Array.isArray(data.candidates) ? data.candidates : []
        setDirectoryAdvisors(list)
        setDirectoryStatus(list.length ? 'ok' : 'empty')
      }
    } catch {
      // Si falla el re-ranking post-plan, se conserva la lista inicial.
    }
    setDone(true)
    onDone(streamed)
  }

  const CANONICAL_ORDER = [
    'SCORECARD',
    'DIAGNÓSTICO',
    'TABLA COMPARATIVA',
    'PLAN DE ACCIÓN',
    'PROYECCIÓN DE IMPACTO',
    'MÉTRICAS DE ÉXITO (KPI´S)',
    'RIESGOS Y MITIGACIONES',
    'HOJA DE RUTA',
    'ADVISORS RECOMENDADOS',
    'CARTA DEL CONSEJO',
  ]

  const sectionIcons = {
    'SCORECARD': '01',
    'DIAGNÓSTICO': '02',
    'TABLA COMPARATIVA': '03',
    'PLAN DE ACCIÓN': '04',
    'PROYECCIÓN DE IMPACTO': '05',
    'MÉTRICAS DE ÉXITO (KPI´S)': '06',
    'MÉTRICAS DE ÉXITO': '06',
    'RIESGOS Y MITIGACIONES': '07',
    'HOJA DE RUTA': '08',
    'ADVISORS RECOMENDADOS': '09',
    'CARTA DEL CONSEJO': '10',
  }

  function renderScorecard(content) {
    const metrics = []
    const lines = content.split('\n')
    for (const line of lines) {
      const cleaned = line.replace(/^[\s\-\*•]+/, '').replace(/\*\*/g, '').trim()
      const match = cleaned.match(/(URGENCIA|COMPLEJIDAD|OPORTUNIDAD)[:\s]+(\d+)\s*[\/de]+\s*10[\s\-–:]+(.+)/i)
      if (match) {
        metrics.push({ label: match[1].toUpperCase(), score: parseInt(match[2]), desc: match[3].trim() })
      }
    }
    if (metrics.length === 0) return null

    const colors = {
      'URGENCIA': { high: 'var(--red)', mid: '#e65100', low: 'var(--green)' },
      'COMPLEJIDAD': { high: 'var(--red)', mid: '#e65100', low: 'var(--green)' },
      'OPORTUNIDAD': { high: 'var(--green)', mid: '#e65100', low: 'var(--red)' },
    }

    return (
      <div className="scorecard-grid">
        {metrics.map((m, i) => {
          const palette = colors[m.label.toUpperCase()] || colors['URGENCIA']
          const color = m.score >= 7 ? palette.high : m.score >= 4 ? palette.mid : palette.low
          return (
            <div key={i} className="scorecard-item">
              <div className="scorecard-ring" style={{ '--score-color': color }}>
                <svg viewBox="0 0 36 36" className="scorecard-svg">
                  <path className="scorecard-bg-circle" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="scorecard-fg-circle" strokeDasharray={`${m.score * 10}, 100`} style={{ stroke: color }} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <span className="scorecard-number" style={{ color }}>{m.score}</span>
              </div>
              <div className="scorecard-info">
                <span className="scorecard-label">{m.label}</span>
                <span className="scorecard-desc">{m.desc}</span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  function renderTimeline(content) {
    const blocks = []
    const lines = content.split('\n')
    let current = null

    for (const line of lines) {
      const trimmed = line.trim()
      const blockMatch = line.match(/^DÍAS?\s*(\d+[-–]\d+):\s*(.+)/i)
      if (blockMatch) {
        if (current) blocks.push(current)
        current = { range: blockMatch[1], title: blockMatch[2].trim(), items: [] }
      } else if (current && (/^\d+\./.test(trimmed) || /^[-*]\s+/.test(trimmed))) {
        current.items.push(
          trimmed
            .replace(/^\d+\.\s*/, '')
            .replace(/^[-*]\s+/, '')
            .trim(),
        )
      }
    }
    if (current) blocks.push(current)
    if (blocks.length === 0) return null

    const blockColors = ['var(--red)', 'var(--accent)', 'var(--green)']
    const blockColorsPrint = ['#c62828', '#1565c0', '#2e7d32']
    const phaseLabels = ['FASE 1', 'FASE 2', 'FASE 3']
    const phaseIcons = [
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="12" width="6" height="10" rx="1"/><rect x="9" y="8" width="6" height="14" rx="1"/><rect x="16" y="4" width="6" height="18" rx="1"/></svg>,
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>,
    ]

    return (
      <div className="timeline-container">
        {/* Barra de progreso superior */}
        <div className="timeline-progress-bar">
          {blocks.map((_, i) => (
            <div key={i} className="timeline-progress-segment" style={{ background: blockColors[i] || blockColors[0] }}>
              <span className="timeline-progress-label">{phaseLabels[i] || `FASE ${i + 1}`}</span>
            </div>
          ))}
        </div>
        {/* Bloques de fases */}
        <div className="timeline-phases">
          {blocks.map((block, i) => (
            <div key={i} className="timeline-block">
              <div className="timeline-header" style={{ '--phase-color': blockColors[i] || blockColors[0], '--phase-color-print': blockColorsPrint[i] || blockColorsPrint[0] }}>
                <div className="timeline-header-top">
                  <span className="timeline-phase-icon">{phaseIcons[i] || '📋'}</span>
                  <div className="timeline-header-text">
                    <span className="timeline-range">Días {block.range}</span>
                    <span className="timeline-title">{block.title}</span>
                  </div>
                </div>
              </div>
              <div className="timeline-items">
                {block.items.map((item, j) => (
                  <div key={j} className="timeline-item">
                    <span className="timeline-item-num" style={{ background: blockColors[i] || blockColors[0] }}>{j + 1}</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  function normalizeTitle(title) {
    return title
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
  }

  function sectionNumForTitle(title) {
    const u = normalizeTitle(title)
    for (const key of Object.keys(sectionIcons)) {
      const k = normalizeTitle(key)
      if (u.includes(k)) return sectionIcons[key]
    }
    return null
  }

  function canonicalIndex(title) {
    const u = normalizeTitle(title)
    for (let i = 0; i < CANONICAL_ORDER.length; i++) {
      const k = normalizeTitle(CANONICAL_ORDER[i])
      if (u.startsWith(k)) {
        const rest = u.slice(k.length).trim()
        // Permite sufijos cortos que no comiencen con dígito (sub-items enumerados: "1:", "2.")
        // Ejemplos válidos: "EJECUTIVO", ": 90 DIAS", ": CONSEJO VS IA"
        // Ejemplos rechazados: "1: DIAGNOSTICO INTEGRAL", "2. VALIDACION DE MERCADO"
        if (rest.length <= 16 && !/^\d/.test(rest)) return i
      }
    }
    const metricsIdx = CANONICAL_ORDER.indexOf('MÉTRICAS DE ÉXITO (KPI´S)')
    if (metricsIdx >= 0 && u === normalizeTitle('MÉTRICAS DE ÉXITO')) return metricsIdx
    return CANONICAL_ORDER.length
  }

  /** Título visible: unifica la sección de plan (evita "PLAN DE ACCIÓN" + "PLAN DE ACCIÓN EJECUTIVO"). */
  function displaySectionTitle(title) {
    const planIdx = CANONICAL_ORDER.indexOf('PLAN DE ACCIÓN')
    if (planIdx >= 0 && canonicalIndex(title) === planIdx) return 'Plan de acción'
    const metricsIdx = CANONICAL_ORDER.indexOf('MÉTRICAS DE ÉXITO (KPI´S)')
    if (metricsIdx >= 0 && canonicalIndex(title) === metricsIdx) return 'Métricas de éxito (KPI´S)'
    return title
  }

  function isAdvisorsRecomendadosSection(title) {
    const idx = CANONICAL_ORDER.indexOf('ADVISORS RECOMENDADOS')
    return idx >= 0 && canonicalIndex(title) === idx
  }

  /** Parte solo por encabezados de nivel ## (secciones principales); ## preserva subtítulos internos. */
  function parseSections(text) {
    if (!text || !text.trim()) return []
    const rawLines = text.replace(/\r\n/g, '\n').split('\n')
    const blocks = []
    let currentTitle = null
    let currentLines = []

    function flush() {
      const content = currentLines.join('\n').trim()
      if (currentTitle === null && !content) return
      const title = currentTitle ?? 'Introducción'
      blocks.push({ title, content })
      currentTitle = null
      currentLines = []
    }

    for (const line of rawLines) {
      // Solo crea nueva sección si el encabezado ## coincide con un nombre canónico conocido;
      // sub-encabezados no canónicos (ej. "## 1. Acción") quedan como contenido de la sección actual.
      const m = line.match(/^#{1,2}\s+(.+)$/)
      if (m && canonicalIndex(m[1].trim()) < CANONICAL_ORDER.length) {
        flush()
        currentTitle = m[1].trim()
      } else {
        currentLines.push(line)
      }
    }
    flush()

    const mapped = blocks.map((b) => ({
      title: b.title,
      content: b.content,
      num: sectionNumForTitle(b.title),
    }))

    // Filtra cualquier sección "Introducción" — no es un módulo canónico válido.
    const cleaned = mapped.filter((s) => normalizeTitle(s.title) !== 'INTRODUCCION')

    // Solo ordenar cuando el streaming terminó; durante streaming el sort
    // causaría parpadeo por reordenamientos continuos con key={sec.title}.
    if (done) {
      cleaned.sort((a, b) => canonicalIndex(a.title) - canonicalIndex(b.title))

      // Fusionar secciones duplicadas que mapean al mismo índice canónico
      const merged = []
      for (const sec of cleaned) {
        const ci = canonicalIndex(sec.title)
        const prev = merged.length > 0 ? merged[merged.length - 1] : null
        if (prev && canonicalIndex(prev.title) === ci) {
          // Fusionar contenido, quedarnos con el título más corto (canónico)
          const prevContent = (prev.content || '').trim()
          const secContent = (sec.content || '').trim()
          prev.content = [prevContent, secContent].filter(Boolean).join('\n\n')
          if (sec.title.length < prev.title.length) prev.title = sec.title
        } else {
          merged.push({ ...sec })
        }
      }
      return merged.map((s, i) => ({
        ...s,
        num: s.num ?? String(i + 1).padStart(2, '0'),
        index: i,
      }))
    }

    // Asignar número de sección según posición final
    return cleaned.map((s, i) => ({
      ...s,
      num: s.num ?? String(i + 1).padStart(2, '0'),
      index: i,
    }))
  }

  function renderMarkdownBody(content, stripCompanyHeading = null) {
    let body = content || ''
    if (stripCompanyHeading?.trim()) {
      body = stripRedundantCompanyHeadingMarkdown(body, stripCompanyHeading)
    }
    const trimmed = body.trim()
    if (!trimmed) return null
    return (
      <div className="plan-markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {trimmed}
        </ReactMarkdown>
      </div>
    )
  }

  function renderSectionContent(title, content) {
    const u = title.toUpperCase()
    const isScorecard = u === 'SCORECARD' || (u.includes('SCORECARD') && !u.includes('DIAGNÓSTICO'))
    const isTimeline = u.includes('HOJA DE RUTA') || u.includes('90 DÍAS')
    const isCarta = u.includes('CARTA DEL CONSEJO')
    const planIdx = CANONICAL_ORDER.indexOf('PLAN DE ACCIÓN')
    const stripCompanyHeading =
      planIdx >= 0 && canonicalIndex(title) === planIdx && session.company?.trim()
        ? session.company
        : null

    const scorecardEl = isScorecard ? renderScorecard(content) : null
    const timelineEl = isTimeline ? renderTimeline(content) : null
    return (
      <div className="plan-section-content">
        {isScorecard && (scorecardEl || renderMarkdownBody(content, stripCompanyHeading))}
        {isTimeline && (timelineEl || renderMarkdownBody(content, stripCompanyHeading))}
        {isCarta && renderMarkdownBody(content, stripCompanyHeading)}
        {!isScorecard && !isTimeline && !isCarta &&
          renderMarkdownBody(content, stripCompanyHeading)}
      </div>
    )
  }

  const sections = output ? parseSections(output) : []
  const printSections = (() => {
    const ordered = [...sections]
    const cartaIndex = ordered.findIndex((s) =>
      normalizeTitle(s.title).includes('CARTA DEL CONSEJO')
    )
    if (cartaIndex === -1) return ordered
    const [carta] = ordered.splice(cartaIndex, 1)
    ordered.push(carta)
    return ordered
  })()
  const totalSlides = sections.length
  const currentSection = sections[currentSlide]

  function goNext() {
    if (currentSlide < totalSlides - 1) setCurrentSlide(currentSlide + 1)
  }
  function goPrev() {
    if (currentSlide > 0) setCurrentSlide(currentSlide - 1)
  }

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goNext() }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goPrev() }
    }
    if (done && totalSlides > 0) {
      window.addEventListener('keydown', handleKey)
      return () => window.removeEventListener('keydown', handleKey)
    }
  }, [done, currentSlide, totalSlides])

  const printDate = new Date().toLocaleDateString('es-MX', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  const expertNames = experts.filter(e => e.name?.trim()).map(e => e.name.trim())

  function renderDirectoryAdvisorsPanel({ printClass = '' } = {}) {
    const wrap = (inner) => <div className={`directory-advisors ${printClass}`.trim()}>{inner}</div>

    // Parsea la justificación generada por el modelo para cada advisor
    const advisorSection = extractAdvisorsSection(output)
    const aiAdvisors = parseAdvisorsFromMarkdown(advisorSection)
    const normAdvisorName = (s) =>
      String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\*\*/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    // Fuzzy match: busca la entrada de aiAdvisors con más tokens en común con el nombre del DB.
    // Requiere al menos 1 token de 4+ letras en común para evitar falsos positivos.
    const findAiEntry = (dbName) => {
      const exact = aiAdvisors[normAdvisorName(dbName)]
      if (exact) return exact
      const dbTokens = normAdvisorName(dbName).split(' ').filter((t) => t.length >= 4)
      if (dbTokens.length === 0) return undefined
      let bestEntry = undefined
      let bestScore = 0
      for (const [key, entry] of Object.entries(aiAdvisors)) {
        const keyTokens = new Set(key.split(' '))
        const matches = dbTokens.filter((t) => keyTokens.has(t)).length
        if (matches > bestScore) {
          bestScore = matches
          bestEntry = entry
        }
      }
      return bestScore >= 1 ? bestEntry : undefined
    }

    if (directoryStatus === 'loading') {
      return wrap(
        <div className="directory-advisors-loading">
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
          <span>Consultando directorio Advisory…</span>
        </div>
      )
    }
    if (directoryStatus === 'error') {
      return wrap(
        <div className="directory-advisors-message">
          <strong>No se pudo cargar el directorio.</strong>
          <span>
            {' '}Ejecuta <code>npm run dev</code> (proxy en puerto 3001) y revisa <code>SUPABASE_URL</code> / <code>SUPABASE_SERVICE_ROLE_KEY</code> en el servidor.
          </span>
        </div>
      )
    }
    if (directoryStatus === 'empty') {
      return wrap(
        <div className="directory-advisors-message">
          <span className="directory-advisors-kicker">Directorio Advisory</span>
          <p>
            No hay candidatos para mostrar. Si la tabla <code>advisory</code> tiene filas, comprueba que <code>SUPABASE_URL</code> y <code>SUPABASE_SERVICE_ROLE_KEY</code> estén en <code>.env</code> o <code>.env.local</code> (el servidor carga ambos) y reinicia <code>npm run dev</code>. También revisa que no estén todas con <code>activo = false</code> y que la tabla exista en el proyecto correcto.
          </p>
        </div>
      )
    }
    return wrap(
      <>
        <div className="directory-advisors-top">
          <span className="directory-advisors-badge"><Users size={13} /> Directorio</span>
          <h4 className="directory-advisors-title">Advisors sugeridos para este caso</h4>
          <p className="directory-advisors-sub">Perfiles del directorio recomendados para networking y asesoría.</p>
        </div>
        <ol className="directory-advisors-list">
          {(() => {
            let rank = 0
            return directoryAdvisors.map((a) => {
              const aiEntry = findAiEntry(a.nombre)
              const justification =
                aiEntry?.justificacion?.trim() ||
                buildAdvisorHelpFallback({
                  fitSummary: a.fitSummary,
                  especialidad: aiEntry?.especialidad,
                })
              if (!justification) return null
              rank += 1
              const desc = (a.bio || a.productos_servicios || '').trim()
              return (
                <li key={a.id || `adv-${rank}`} className="directory-advisors-item">
                  <span className="directory-advisor-rank">{rank}</span>
                  <div className="directory-advisor-body">
                    <div className="directory-advisor-nombre">{a.nombre}</div>
                    {(a.empresa || a.email || a.web) && (
                      <div className="directory-advisor-contact">
                        {a.empresa && <span>{a.empresa}</span>}
                        {a.empresa && (a.email || a.web) && <span> · </span>}
                        {a.email && (
                          <a href={`mailto:${a.email}`} className="directory-advisor-link">{a.email}</a>
                        )}
                        {a.email && a.web && <span> · </span>}
                        {a.web && (
                          <a href={a.web.startsWith('http') ? a.web : `https://${a.web}`} target="_blank" rel="noopener noreferrer" className="directory-advisor-link">
                            {a.web}
                          </a>
                        )}
                      </div>
                    )}
                    {(aiEntry?.ajuste || aiEntry?.especialidad) && (
                      <div className="directory-advisor-meta">
                        {aiEntry.ajuste && (
                          <span className={`directory-advisor-ajuste directory-advisor-ajuste-${aiEntry.ajuste.toLowerCase()}`}>
                            Ajuste: {aiEntry.ajuste}
                          </span>
                        )}
                        {aiEntry.especialidad && (
                          <span className="directory-advisor-especialidad">{aiEntry.especialidad}</span>
                        )}
                      </div>
                    )}
                    {desc && (
                      <div className="directory-advisor-description">
                        <span className="directory-advisor-desc-label">Descripción</span>
                        <p className="directory-advisor-desc">{desc.length > 300 ? desc.slice(0, 300) + '…' : desc}</p>
                      </div>
                    )}
                    {/* La justificación extensa se muestra en el bloque markdown de la sección,
                        para evitar duplicar texto dentro de la tarjeta del directorio. */}
                  </div>
                </li>
              )
            })
          })()}
        </ol>
      </>
    )
  }

  // While generating, show full-screen loader
  if (!done) {
    const completedSections = sections.length
    const totalExpected = CANONICAL_ORDER.length
    const sectionProgress = Math.round((completedSections / totalExpected) * 100)
    const textProgress = Math.min(Math.round((output.length / 1200) * 30), 30)
    const progress = Math.min(Math.max(sectionProgress, textProgress), 95)

    const loadingMessages = [
      'Analizando el caso y las respuestas del diagnóstico…',
      'Sintetizando opiniones del consejo…',
      'Construyendo tabla comparativa Consejo vs IA…',
      'Redactando plan de acción ejecutivo…',
      'Calculando proyección de impacto…',
      'Definiendo métricas de éxito (KPI´S)…',
      'Identificando riesgos y mitigaciones…',
      'Armando hoja de ruta de 90 días…',
      'Seleccionando advisors recomendados…',
      'Redactando carta del consejo…',
    ]
    const messageIndex = Math.min(completedSections, loadingMessages.length - 1)
    const currentMessage = loadingMessages[messageIndex]

    return (
      <div className="synthesis-root synthesis-loader-root">
        <div className="synthesis-fullloader">
          <div className="sfl-icon">
            <Loader2 size={44} className="sfl-spinner" />
            <Sparkles size={18} className="sfl-sparkle" />
          </div>
          <div className="sfl-texts">
            <h2 className="sfl-title">Generando plan de acción</h2>
            <p className="sfl-sub">{session.presenter} · {session.company || 'Sesión del foro'}</p>
          </div>
          <div className="sfl-progress-wrap">
            <div className="sfl-progress-bar">
              <div className="sfl-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="sfl-progress-pct">{progress}%</span>
          </div>
          <p className="sfl-message">{currentMessage}</p>
          <div className="sfl-steps">
            {CANONICAL_ORDER.map((name, i) => (
              <div key={name} className={`sfl-step ${i < completedSections ? 'sfl-step-done' : i === completedSections ? 'sfl-step-active' : ''}`}>
                <span className="sfl-step-dot" />
                <span className="sfl-step-label">{name}</span>
              </div>
            ))}
          </div>
        </div>
        <style>{synthesisStyles}</style>
      </div>
    )
  }

  // Done: slide mode
  return (
    <div className="synthesis-root">
      {/* === COVER PAGE (print only) === */}
      <div className="print-cover">
        <div className="cover-top-bar" />
        <div className="cover-body">
          <div className="cover-logo-wrap">
            <img
              src="/assets/logo.jpeg"
              alt="Advisory Business Boards"
              className="cover-logo"
            />
          </div>
          <div className="cover-badge">CONSILIUM</div>
          <h1 className="cover-title">Plan de Acción<br/>Ejecutivo</h1>
          <div className="cover-divider" />
          <div className="cover-company">{session.company || session.presenter}</div>
          <div className="cover-problem">"{session.caseText?.slice(0, 200)}{session.caseText?.length > 200 ? '...' : ''}"</div>
          <div className="cover-meta-grid">
            <div className="cover-meta-item">
              <span className="cover-meta-label">Presentador</span>
              <span className="cover-meta-value">{session.presenter}{session.role ? ` · ${session.role}` : ''}</span>
            </div>
            {session.industry && <div className="cover-meta-item">
              <span className="cover-meta-label">Industria</span>
              <span className="cover-meta-value">{session.industry}</span>
            </div>}
            <div className="cover-meta-item">
              <span className="cover-meta-label">Fecha</span>
              <span className="cover-meta-value">{printDate}</span>
            </div>
            <div className="cover-meta-item">
              <span className="cover-meta-label">Consejeros</span>
              <span className="cover-meta-value">{expertNames.length > 0 ? expertNames.join(', ') : 'N/A'}</span>
            </div>
          </div>
        </div>
        <div className="cover-footer">
          <span>Advisory Business Boards</span>
          <span>Documento confidencial</span>
        </div>
      </div>

      {/* Print content (all sections, hidden on screen) */}
      <div className="print-all-sections">
        <div className="print-page-header">
          <img
            src="/assets/logo.jpeg"
            alt=""
            className="pph-logo"
          />
          <span className="pph-brand">Advisory Business Boards</span>
          <span className="pph-sep">·</span>
          <span className="pph-company">{session.company || session.presenter}</span>
          <span className="pph-sep">·</span>
          <span className="pph-date">{printDate}</span>
        </div>
        {printSections.map((sec, i) => (
          <div key={i} className={`plan-section ${sec.title.toUpperCase().includes('CARTA') ? 'plan-section-carta' : ''}`}>
            <div className="plan-section-header">
              <span className="plan-section-num">{sec.num}</span>
              <h3 className="plan-section-title">{displaySectionTitle(sec.title)}</h3>
            </div>
            {isAdvisorsRecomendadosSection(sec.title) &&
              renderDirectoryAdvisorsPanel({ printClass: 'directory-advisors-printblock' })}
            {renderSectionContent(sec.title, sec.content)}
          </div>
        ))}
      </div>

      {/* Print footer */}
      <div className="print-footer">
        <div className="print-footer-line" />
        <div className="print-footer-content">
          <span>Advisory Business Boards · CONSILIUM</span>
          <span>Documento confidencial · {printDate}</span>
        </div>
      </div>

      {/* === SLIDE VIEW (screen only) === */}
      <div className="slide-container">
        {/* Header */}
        <div className="slide-top">
          <div className="slide-top-left">
            <span className="slide-company">{session.company || session.presenter}</span>
          </div>
          <div className="slide-counter">
            {currentSlide + 1} / {totalSlides}
          </div>
        </div>

        {/* Current slide */}
        {currentSection && (
          <div className={`slide-card ${currentSection.title.toUpperCase().includes('CARTA') ? 'plan-section-carta' : ''}`}>
            <div className="plan-section-header">
              <span className="plan-section-num">{currentSection.num}</span>
              <h3 className="plan-section-title">{displaySectionTitle(currentSection.title)}</h3>
            </div>
            {isAdvisorsRecomendadosSection(currentSection.title) && renderDirectoryAdvisorsPanel()}
            {renderSectionContent(currentSection.title, currentSection.content)}
          </div>
        )}

        {/* Navigation */}
        <div className="slide-nav">
          <button
            className="slide-nav-btn"
            onClick={goPrev}
            disabled={currentSlide === 0}
            style={{ opacity: currentSlide === 0 ? 0.3 : 1 }}
          >
            <ChevronLeft size={18} />
            Anterior
          </button>

          <div className="slide-dots">
            {sections.map((_, i) => (
              <button
                key={i}
                className={`slide-dot ${i === currentSlide ? 'slide-dot-active' : ''}`}
                onClick={() => setCurrentSlide(i)}
              />
            ))}
          </div>

          <button
            className="slide-nav-btn"
            onClick={goNext}
            disabled={currentSlide === totalSlides - 1}
            style={{ opacity: currentSlide === totalSlides - 1 ? 0.3 : 1 }}
          >
            Siguiente
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Print button */}
        <div className="synthesis-footer">
          <button className="print-btn" onClick={() => window.print()}>
            <Printer size={16} /> Exportar / Imprimir
          </button>
        </div>
      </div>

      <style>{synthesisStyles}</style>
    </div>
  )
}

const synthesisStyles = `
  @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
  @keyframes blink { 0%,100% { opacity: 1 } 50% { opacity: 0 } }
  @keyframes progressPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.7 } }
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }

  /* ===== SCREEN STYLES ===== */
  .synthesis-root {
    display: flex; flex-direction: column; gap: 24px;
    max-width: 900px; margin: 0 auto; padding: 40px 24px;
    height: 100%; overflow-y: auto;
  }
  .synthesis-loader-root {
    display: flex; align-items: center; justify-content: center;
    max-width: 100%; padding: 0; height: 100%; overflow: hidden;
  }
  .print-cover, .print-page-header, .print-footer, .print-all-sections { display: none; }

  /* Full-screen loader */
  .synthesis-fullloader {
    display: flex; flex-direction: column; align-items: center; gap: 24px;
    max-width: 480px; width: 100%; padding: 48px 32px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 16px; text-align: center;
    animation: fadeInUp 0.4s ease;
  }
  .sfl-icon {
    position: relative; width: 72px; height: 72px;
    display: flex; align-items: center; justify-content: center;
  }
  .sfl-spinner {
    color: var(--gold);
    animation: spin 1.2s linear infinite;
  }
  .sfl-sparkle {
    position: absolute; bottom: 4px; right: 4px;
    color: var(--accent); opacity: 0.8;
  }
  .sfl-texts { display: flex; flex-direction: column; gap: 6px; }
  .sfl-title {
    font-family: var(--font-display); font-size: 22px; font-weight: 700;
    color: var(--text); margin: 0;
  }
  .sfl-sub { font-size: 13px; color: var(--text-muted); margin: 0; }

  .sfl-progress-wrap {
    width: 100%; display: flex; align-items: center; gap: 10px;
  }
  .sfl-progress-bar {
    flex: 1; height: 6px; background: var(--border);
    border-radius: 99px; overflow: hidden;
  }
  .sfl-progress-fill {
    height: 100%; background: var(--gold);
    border-radius: 99px;
    transition: width 0.6s ease;
    animation: progressPulse 2s ease-in-out infinite;
  }
  .sfl-progress-pct {
    font-family: var(--font-mono); font-size: 12px;
    color: var(--text-muted); min-width: 32px; text-align: right;
  }

  .sfl-message {
    font-size: 13px; color: var(--text-muted); margin: 0;
    min-height: 20px; transition: opacity 0.3s;
    font-style: italic;
  }

  .sfl-steps {
    width: 100%; display: flex; flex-direction: column; gap: 6px;
    text-align: left; max-height: 220px; overflow: hidden;
  }
  .sfl-step {
    display: flex; align-items: center; gap: 10px;
    opacity: 0.3; transition: opacity 0.4s;
  }
  .sfl-step-done { opacity: 0.5; }
  .sfl-step-active { opacity: 1; }
  .sfl-step-dot {
    flex-shrink: 0; width: 7px; height: 7px; border-radius: 50%;
    background: var(--border); transition: background 0.4s;
  }
  .sfl-step-done .sfl-step-dot { background: var(--green); }
  .sfl-step-active .sfl-step-dot {
    background: var(--gold);
    box-shadow: 0 0 6px var(--gold);
    animation: progressPulse 1s ease-in-out infinite;
  }
  .sfl-step-label {
    font-size: 12px; color: var(--text-muted);
    font-family: var(--font-body); letter-spacing: 0.02em;
  }
  .sfl-step-active .sfl-step-label { color: var(--text); font-weight: 600; }
  .sfl-step-done .sfl-step-label { text-decoration: line-through; }

  .screen-header { display: flex; flex-direction: column; gap: 10px; }
  .screen-title { font-family: var(--font-display); font-size: 32px; font-weight: 700; color: var(--text); }
  .screen-meta { font-size: 13px; color: var(--text-muted); }

  .synthesis-loading {
    display: flex; align-items: center; gap: 10px;
    color: var(--text-muted); font-size: 14px; padding: 40px 0;
  }

  /* Streaming output (hidden — kept for reference but not shown during load) */
  .plan-output-streaming { display: flex; flex-direction: column; gap: 20px; padding-bottom: 40px; }

  /* Slide container */
  .slide-container {
    display: flex; flex-direction: column; gap: 20px; flex: 1;
  }
  .slide-top {
    display: flex; align-items: center; justify-content: space-between;
  }
  .slide-top-left {
    display: flex; align-items: center; gap: 16px;
  }
  .slide-company {
    font-size: 14px; color: var(--text-muted); font-weight: 500;
  }

  /* Directorio Advisory (solo en sección ADVISORS RECOMENDADOS; no depende del markdown del modelo) */
  .directory-advisors {
    background: linear-gradient(135deg, var(--accent-dim) 0%, var(--surface) 100%);
    border: 1px solid var(--accent);
    border-radius: 10px;
    padding: 16px 18px;
    margin-bottom: 4px;
  }
  .slide-card .directory-advisors {
    margin-top: 4px;
    margin-bottom: 18px;
  }
  .directory-advisors-loading {
    display: flex; align-items: center; gap: 10px;
    font-size: 13px; color: var(--text-muted);
  }
  .directory-advisors-message {
    font-size: 13px; color: var(--text-muted); line-height: 1.55;
  }
  .directory-advisors-message strong { color: var(--text); }
  .directory-advisors-message code {
    font-family: var(--font-mono); font-size: 11px;
    background: var(--surface-2); padding: 1px 5px; border-radius: 3px;
  }
  .directory-advisors-kicker {
    display: block; font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--accent); margin-bottom: 6px;
  }
  .directory-advisors-top { margin-bottom: 12px; }
  .directory-advisors-badge {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 10px; font-weight: 600; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--accent);
    border: 1px solid var(--accent); padding: 3px 8px; border-radius: 4px;
    margin-bottom: 8px;
  }
  .directory-advisors-title {
    font-family: var(--font-display); font-size: 17px; font-weight: 600;
    color: var(--text); margin: 0 0 4px 0;
  }
  .directory-advisors-sub {
    font-size: 12px; color: var(--text-dim); margin: 0; line-height: 1.4;
  }
  .directory-advisors-list {
    list-style: none; margin: 0; padding: 0;
    display: flex; flex-direction: column; gap: 12px;
  }
  .directory-advisors-item {
    display: flex; gap: 12px; align-items: flex-start;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 8px; padding: 12px 14px;
  }
  .directory-advisor-rank {
    flex-shrink: 0; width: 26px; height: 26px;
    background: var(--accent); color: #fff; border-radius: 6px;
    font-family: var(--font-mono); font-size: 12px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
  }
  .directory-advisor-nombre {
    font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 4px;
  }
  .directory-advisor-contact {
    font-size: 12px; color: var(--text-muted); word-break: break-word;
  }
  .directory-advisor-link {
    color: var(--accent); text-decoration: none;
  }
  .directory-advisor-link:hover {
    text-decoration: underline;
  }
  .directory-advisor-meta {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 6px;
  }
  .directory-advisor-ajuste {
    font-size: 11px; font-weight: 700; letter-spacing: 0.05em;
    padding: 2px 8px; border-radius: 20px; text-transform: uppercase;
  }
  .directory-advisor-ajuste-alto {
    background: #e8f5e9; color: #2e7d32;
  }
  .directory-advisor-ajuste-medio {
    background: #fff8e1; color: #e65100;
  }
  .directory-advisor-especialidad {
    font-size: 12px; color: var(--text-muted); font-style: italic;
  }
  .directory-advisor-description {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .directory-advisor-desc-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .directory-advisor-desc {
    font-size: 12px;
    color: var(--text-dim);
    line-height: 1.5;
    margin: 0;
  }
  .directory-advisor-justification {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .directory-advisor-why-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .directory-advisor-why {
    font-size: 12px;
    color: var(--text-dim);
    line-height: 1.5;
    margin: 0;
  }

  .slide-counter {
    font-family: var(--font-mono); font-size: 14px; color: var(--text-dim);
    background: var(--surface); border: 1px solid var(--border);
    padding: 4px 14px; border-radius: 20px;
  }

  .slide-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; padding: 32px;
    display: flex; flex-direction: column; gap: 20px;
    flex: 1; min-height: 300px; min-width: 0;
    overflow-x: hidden;
    animation: slideIn 0.3s ease;
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(20px); }
    to { opacity: 1; transform: translateX(0); }
  }

  .slide-nav {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 0;
  }
  .slide-nav-btn {
    display: flex; align-items: center; gap: 6px;
    background: var(--surface); border: 1px solid var(--border);
    color: var(--text); border-radius: 8px;
    padding: 10px 20px; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: all 0.2s;
    font-family: var(--font-body);
  }
  .slide-nav-btn:hover:not(:disabled) {
    border-color: var(--accent); color: var(--accent);
  }
  .slide-dots {
    display: flex; gap: 6px; align-items: center;
  }
  .slide-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--border); border: none; cursor: pointer;
    transition: all 0.2s; padding: 0;
  }
  .slide-dot-active {
    background: var(--gold); width: 24px; border-radius: 4px;
  }

  /* Section styles */
  .plan-section {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 8px; padding: 24px;
    display: flex; flex-direction: column; gap: 14px;
  }
  .plan-section-header { display: flex; align-items: center; gap: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
  .plan-section-num {
    font-family: var(--font-mono); font-size: 12px; font-weight: 700;
    color: #fff; background: var(--gold); border-radius: 4px;
    width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .plan-section-title {
    font-family: var(--font-display); font-size: 18px; font-weight: 600;
    color: var(--gold); letter-spacing: 0.02em; margin: 0;
  }
  .plan-section-content { display: flex; flex-direction: column; gap: 10px; min-width: 0; overflow: hidden; }

  /* Markdown body */
  .plan-markdown { display: flex; flex-direction: column; gap: 0.35em; min-width: 0; }
  .plan-markdown-p { margin: 0 0 0.5em 0; }
  .plan-markdown-p:last-child { margin-bottom: 0; }
  .plan-markdown-ul {
    margin: 0.25em 0 0.75em 0;
    padding: 0;
    font-size: 14px;
    color: var(--text);
    line-height: 1.65;
    list-style: none;
  }
  .plan-markdown-ol {
    margin: 0.25em 0 0.75em 0;
    padding: 0;
    font-size: 14px;
    color: var(--text);
    line-height: 1.65;
    list-style: none;
    counter-reset: plan-ol;
  }
  .plan-markdown-ol > .plan-markdown-li {
    counter-increment: plan-ol;
    padding-left: 32px;
    position: relative;
  }
  .plan-markdown-ol > .plan-markdown-li::before {
    content: counter(plan-ol);
    position: absolute; left: 0; top: 2px;
    width: 22px; height: 22px; border-radius: 50%;
    background: var(--gold); color: #fff;
    font-size: 11px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
  }
  .plan-markdown-ul > .plan-markdown-li {
    padding-left: 20px;
    position: relative;
  }
  .plan-markdown-ul > .plan-markdown-li::before {
    content: '';
    position: absolute; left: 2px; top: 8px;
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--gold);
  }
  .plan-markdown-li { margin: 0.4em 0; }
  .plan-md-heading {
    font-family: var(--font-display);
    font-size: 15px;
    font-weight: 700;
    color: var(--gold);
    margin: 1em 0 0.35em 0;
    line-height: 1.3;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--border);
    letter-spacing: 0.02em;
  }
  .plan-md-heading:first-child { margin-top: 0; }
  .plan-md-heading-sm {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
    margin: 0.6em 0 0.3em 0;
    letter-spacing: 0.01em;
  }
  .plan-md-strong { font-weight: 700; color: var(--text); }
  .plan-md-em { font-style: italic; }
  .plan-md-a { color: var(--accent); text-decoration: underline; word-break: break-all; }
  .plan-md-bq {
    margin: 0.5em 0;
    padding: 12px 18px;
    border-left: 4px solid var(--gold);
    background: var(--surface-2);
    border-radius: 0 6px 6px 0;
    font-size: 14px;
    color: var(--text-muted);
    font-style: italic;
  }
  .plan-md-code-inline {
    font-family: var(--font-mono);
    font-size: 0.9em;
    background: var(--surface-2);
    padding: 1px 6px;
    border-radius: 4px;
  }
  .plan-md-pre {
    margin: 0.5em 0;
    padding: 12px 14px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow-x: auto;
    font-size: 13px;
  }
  .plan-md-hr { border: none; border-top: 1px solid var(--border); margin: 1em 0; }
  .plan-md-table-wrap { margin: 0.75em 0; }

  /* Table styles */
  .plan-table-wrapper {
    overflow-x: auto; border-radius: 6px;
    border: 1px solid var(--border);
  }
  .plan-table {
    width: 100%; border-collapse: collapse;
    font-size: 13px; color: var(--text);
  }
  .plan-table th {
    background: var(--accent); color: #fff;
    padding: 10px 14px; text-align: left;
    font-size: 11px; font-weight: 600;
    letter-spacing: 0.06em; text-transform: uppercase;
    white-space: nowrap;
  }
  .plan-table td {
    padding: 10px 14px; border-bottom: 1px solid var(--border);
    line-height: 1.5; vertical-align: top;
  }
  .plan-table tr:last-child td { border-bottom: none; }
  .plan-table tr:nth-child(even) td { background: var(--surface-2); }
  .plan-table tr:hover td { background: var(--accent-dim); }
  .coincidence-high {
    color: var(--green) !important; font-weight: 600;
  }
  .coincidence-mid {
    color: #e65100 !important; font-weight: 600;
  }
  .coincidence-low {
    color: var(--red) !important; font-weight: 600;
  }

  .plan-para { font-size: 14px; color: var(--text); line-height: 1.7; margin: 0; word-wrap: break-word; overflow-wrap: break-word; }
  .plan-numbered { display: flex; gap: 14px; align-items: flex-start; font-size: 14px; color: var(--text); line-height: 1.7; }
  .plan-num {
    flex-shrink: 0; width: 24px; height: 24px;
    background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; color: var(--accent); font-family: var(--font-mono); margin-top: 2px;
  }
  .plan-num-text { word-wrap: break-word; overflow-wrap: break-word; }
  .plan-bullet {
    font-size: 14px; color: var(--text); line-height: 1.7;
    padding-left: 20px; position: relative; word-wrap: break-word; overflow-wrap: break-word;
  }
  .plan-bullet::before {
    content: ''; position: absolute; left: 2px; top: 10px;
    width: 7px; height: 7px; background: var(--gold); border-radius: 50%;
  }

  /* Scorecard */
  .scorecard-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
  }
  .scorecard-item {
    display: flex; flex-direction: column; align-items: center; gap: 12px;
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 8px; padding: 20px 16px; text-align: center;
  }
  .scorecard-ring { position: relative; width: 80px; height: 80px; }
  .scorecard-svg { width: 100%; height: 100%; transform: rotate(-90deg); }
  .scorecard-bg-circle {
    fill: none; stroke: var(--border); stroke-width: 2.5;
  }
  .scorecard-fg-circle {
    fill: none; stroke-width: 2.5; stroke-linecap: round;
    transition: stroke-dasharray 0.6s ease;
  }
  .scorecard-number {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    font-family: var(--font-mono); font-size: 24px; font-weight: 700;
  }
  .scorecard-info { display: flex; flex-direction: column; gap: 4px; }
  .scorecard-label {
    font-size: 11px; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--text-muted);
  }
  .scorecard-desc { font-size: 12px; color: var(--text-dim); line-height: 1.4; }

  /* Timeline */
  .timeline-container {
    display: flex; flex-direction: column; gap: 0;
    min-width: 0; width: 100%; box-sizing: border-box;
  }
  .timeline-progress-bar {
    display: flex; border-radius: 4px; overflow: hidden; height: 24px; margin-bottom: 14px;
  }
  .timeline-progress-segment {
    flex: 1; display: flex; align-items: center; justify-content: center;
  }
  .timeline-progress-label {
    font-size: 10px; font-weight: 700; letter-spacing: 0.14em; color: #fff;
  }
  .timeline-phases {
    display: flex; flex-direction: column; gap: 12px;
  }
  .timeline-block {
    display: flex; flex-direction: column;
    border: 1px solid var(--border); border-radius: 6px;
    border-left: 3px solid var(--phase-color);
    min-width: 0; overflow: hidden;
  }
  .timeline-header {
    padding: 10px 14px;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
  }
  .timeline-header-top {
    display: flex; align-items: center; gap: 10px;
  }
  .timeline-phase-icon {
    display: flex; align-items: center; justify-content: center;
    color: var(--phase-color); flex-shrink: 0;
  }
  .timeline-header-text {
    display: flex; flex-direction: column; gap: 1px;
  }
  .timeline-range {
    font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
    color: var(--phase-color); text-transform: uppercase;
  }
  .timeline-title { font-size: 13px; font-weight: 600; color: var(--text); }
  .timeline-items {
    padding: 10px 14px; display: flex; flex-direction: column; gap: 8px;
  }
  .timeline-item {
    display: flex; align-items: flex-start; gap: 10px;
    font-size: 12px; color: var(--text); line-height: 1.5;
  }
  .timeline-item-num {
    width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 700; color: #fff; margin-top: 1px;
  }

  /* Carta */
  .plan-section-carta {
    background: linear-gradient(135deg, #fafafa 0%, #f5f0eb 100%) !important;
    border: 2px solid #1a1a2e !important;
    border-radius: 4px !important;
    position: relative;
  }
  .plan-section-carta::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 4px;
    background: linear-gradient(90deg, #1a1a2e, #c62828, #1a1a2e);
    border-radius: 4px 4px 0 0;
  }
  .carta-container { padding: 8px 0; }
  .carta-text {
    font-size: 15px; color: var(--text); line-height: 1.8;
    font-style: italic; margin: 0;
  }

  .synthesis-cursor { display: inline-block; animation: blink 0.8s infinite; color: var(--gold); font-size: 18px; }
  .synthesis-footer { display: flex; justify-content: center; padding-bottom: 16px; padding-top: 8px; }
  .print-btn {
    display: flex; align-items: center; gap: 10px;
    background: var(--accent); border: none; color: #fff; border-radius: 6px;
    padding: 14px 36px; font-size: 15px; font-weight: 700;
    letter-spacing: 0.04em; cursor: pointer; font-family: var(--font-body);
  }

  /* ===== PRINT STYLES ===== */
  @media print {
    *, *::before, *::after {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    @page { margin: 2cm 1.8cm; size: letter; }

    html, body, #root, main {
      background: white !important;
      overflow: visible !important;
      height: auto !important;
      margin: 0 !important; padding: 0 !important;
    }

    nav, .synthesis-footer, .synthesis-loading, .synthesis-cursor, .screen-header,
    .slide-container, .slide-nav, .slide-top, button {
      display: none !important;
    }

    .synthesis-root {
      max-width: 100% !important; padding: 0 !important;
      overflow: visible !important; height: auto !important; gap: 0 !important;
      display: block !important;
    }

    .synthesis-root, .synthesis-root * {
      overflow: visible !important;
    }

    .print-all-sections {
      display: block !important;
      padding: 36px 42px 28px !important;
    }

    .print-all-sections .plan-section .directory-advisors {
      margin-top: 12px !important;
      margin-bottom: 20px !important;
      page-break-inside: avoid;
      break-inside: avoid;
      border: 1px solid #1565c0 !important;
      background: #f0f7ff !important;
    }
    .print-all-sections .directory-advisor-nombre { color: #1a1a2e !important; }
    .print-all-sections .directory-advisor-desc-label { color: #666 !important; }
    .print-all-sections .directory-advisor-desc { color: #555 !important; }
    .print-all-sections .directory-advisor-why-label { color: #666 !important; }
    .print-all-sections .directory-advisor-why { color: #555 !important; }

    /* ---- COVER PAGE ---- */
    .print-cover {
      display: flex !important;
      flex-direction: column !important;
      justify-content: space-between !important;
      min-height: calc(100vh - 6cm) !important;
      background: #1a1a2e !important;
      color: white !important;
      padding: 0 !important;
      margin: -3cm -2cm 0 -2cm !important;
      padding: 3cm 2cm 2cm 2cm !important;
      page-break-after: always;
      break-after: page;
      overflow: hidden !important;
    }
    .cover-top-bar {
      height: 8px;
      background: var(--red) !important;
    }
    .cover-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 44px 56px;
    }
    .cover-logo-wrap {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #fff !important;
      border-radius: 8px;
      padding: 10px 16px;
      margin-bottom: 22px;
      align-self: flex-start;
    }
    .cover-logo {
      display: block;
      max-height: 52px;
      max-width: 240px;
      width: auto;
      height: auto;
      object-fit: contain;
    }
    .cover-badge {
      font-size: 12px; font-weight: 700; letter-spacing: 0.25em;
      color: var(--red) !important; background: rgba(198,40,40,0.15) !important;
      padding: 6px 16px; border-radius: 3px;
      display: inline-block; align-self: flex-start; margin-bottom: 24px;
    }
    .cover-title {
      font-family: var(--font-display); font-size: 42px; font-weight: 700;
      color: white !important; line-height: 1.15; margin: 0 0 20px 0;
    }
    .cover-divider { width: 60px; height: 4px; background: var(--red) !important; margin-bottom: 24px; border-radius: 2px; }
    .cover-company {
      font-size: 20px; font-weight: 600; color: #afb7c9 !important;
      margin-bottom: 16px;
    }
    .cover-problem {
      font-size: 13px; color: #8390ad !important; line-height: 1.7;
      font-style: italic; max-width: 500px; margin-bottom: 40px;
    }
    .cover-meta-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 16px 40px;
      border-top: 1px solid rgba(255,255,255,0.1); padding-top: 24px;
    }
    .cover-meta-item { display: flex; flex-direction: column; gap: 2px; }
    .cover-meta-label { font-size: 10px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #6b7590 !important; }
    .cover-meta-value { font-size: 13px; color: #9ba4b8 !important; }
    .cover-footer {
      display: flex; justify-content: space-between; padding: 16px 56px;
      border-top: 1px solid rgba(255,255,255,0.08);
      font-size: 10px; color: #6b7590 !important; letter-spacing: 0.08em;
    }

    /* ---- CONTENT PAGES ---- */
    .print-page-header {
      display: flex !important;
      flex-wrap: wrap;
      align-items: center; gap: 8px;
      padding-bottom: 16px; margin-bottom: 28px;
      border-bottom: 2px solid #1a1a2e;
      font-size: 10px; letter-spacing: 0.06em; color: #888 !important;
    }
    .pph-logo {
      height: 30px;
      width: auto;
      max-width: 160px;
      object-fit: contain;
      flex-shrink: 0;
      margin-right: 4px;
    }
    .pph-brand { font-weight: 700; color: #1a1a2e !important; }
    .pph-sep { color: #ccc !important; }
    .pph-company { color: #555 !important; }
    .pph-date { color: #888 !important; }

    .plan-section {
      background: white !important;
      border: none !important;
      border-radius: 0 !important;
      padding: 0 0 22px 0 !important;
      margin-bottom: 22px;
      border-bottom: 1px solid #e0e0e0 !important;
      page-break-inside: auto;
      break-inside: auto;
    }
    .print-all-sections .plan-section {
      page-break-before: always;
      break-before: page;
    }
    .print-page-header + .plan-section {
      page-break-before: avoid !important;
      break-before: avoid !important;
    }
    .plan-section:last-child {
      border-bottom: none !important;
    }

    .plan-section-header {
      border-bottom: none !important;
      padding-bottom: 8px !important;
      margin-bottom: 4px;
      page-break-after: avoid;
      break-after: avoid;
    }

    .plan-section-num {
      background: #1a1a2e !important;
      color: white !important;
      width: 28px !important; height: 28px !important;
      font-size: 11px !important; border-radius: 3px !important;
    }

    .plan-section-title {
      color: #1a1a2e !important;
      font-size: 17px !important;
      font-weight: 700 !important;
      letter-spacing: 0.04em !important;
    }

    .plan-section-content {
      gap: 8px !important;
    }

    .plan-para {
      color: #333 !important; font-size: 11.5pt !important; line-height: 1.6 !important;
      overflow: visible !important; white-space: normal !important;
      word-wrap: break-word !important; overflow-wrap: break-word !important;
      word-break: break-word !important;
      hyphens: auto !important;
      orphans: 3;
      widows: 3;
    }

    .plan-numbered {
      color: #333 !important; font-size: 11.5pt !important; line-height: 1.6 !important;
      gap: 10px !important;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .plan-num-text {
      color: #333 !important; font-size: 11.5pt !important;
      overflow: visible !important; white-space: normal !important;
      word-wrap: break-word !important; overflow-wrap: break-word !important;
      word-break: break-word !important;
      hyphens: auto !important;
    }

    .plan-num {
      background: #1a1a2e !important; color: white !important;
      border: none !important; border-radius: 3px !important;
      width: 22px !important; height: 22px !important; font-size: 10px !important;
    }

    .plan-bullet {
      color: #333 !important; font-size: 11.5pt !important; line-height: 1.6 !important;
      overflow: visible !important; white-space: normal !important;
      word-wrap: break-word !important; overflow-wrap: break-word !important;
      word-break: break-word !important;
      hyphens: auto !important;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .plan-bullet::before { background: var(--red) !important; }

    /* Table print styles */
    .plan-table-wrapper {
      border: 1px solid #ccc !important;
      border-radius: 0 !important;
      overflow: visible !important;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .plan-table { font-size: 10.5pt !important; }
    .plan-table th {
      background: #1a1a2e !important;
      color: white !important;
      padding: 8px 10px !important;
      font-size: 9.5pt !important;
      letter-spacing: 0.03em !important;
    }
    .plan-table td {
      padding: 9px 10px !important;
      color: #333 !important;
      border-bottom: 1px solid #ddd !important;
      font-size: 10.5pt !important;
      line-height: 1.5 !important;
    }
    .plan-table tr:nth-child(even) td {
      background: #f5f5f5 !important;
    }
    .coincidence-high { color: #2e7d32 !important; }
    .coincidence-mid { color: #e65100 !important; }
    .coincidence-low { color: #c62828 !important; }

    /* Scorecard print */
    .scorecard-grid {
      grid-template-columns: repeat(3, 1fr) !important;
      gap: 12px !important;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .scorecard-item {
      background: #f8f8f8 !important;
      border: 1px solid #ddd !important;
      border-radius: 4px !important;
      padding: 16px 12px !important;
    }
    .scorecard-ring { width: 60px !important; height: 60px !important; }
    .scorecard-number { font-size: 20px !important; }
    .scorecard-label { color: #333 !important; }
    .scorecard-desc { color: #666 !important; }

    /* Timeline print */
    .timeline-container {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .timeline-progress-bar {
      height: 24px !important; margin-bottom: 16px !important;
      border-radius: 4px !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .timeline-progress-segment {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .timeline-progress-label { font-size: 9px !important; color: #fff !important; }
    .timeline-phases { gap: 12px !important; }
    .timeline-block {
      border: 1px solid #ccc !important;
      border-left: 4px solid var(--phase-color-print) !important;
      border-radius: 6px !important;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .timeline-header {
      padding: 10px 14px !important;
      background: #f5f5f5 !important;
    }
    .timeline-phase-icon { color: var(--phase-color-print) !important; }
    .timeline-range { font-size: 10px !important; color: var(--phase-color-print) !important; }
    .timeline-title { font-size: 11px !important; color: #1a1a2e !important; }
    .timeline-items { padding: 10px 14px !important; gap: 8px !important; }
    .timeline-item { font-size: 11px !important; color: #333 !important; }
    .timeline-item-num {
      width: 18px !important; height: 18px !important;
      font-size: 9px !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    /* Carta print — diseño formal */
    .plan-section-carta {
      background: #fff !important;
      border: 2px solid #1a1a2e !important;
      border-radius: 0 !important;
      padding: 40px 48px !important;
      margin-top: 20px !important;
      page-break-before: always !important;
      break-before: page !important;
      position: relative;
    }
    .plan-section-carta::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 6px;
      border-radius: 0;
      background: linear-gradient(90deg, #1a1a2e 0%, #c62828 50%, #1a1a2e 100%);
    }
    .plan-section-carta::after {
      content: '';
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 6px;
      border-radius: 0;
      background: linear-gradient(90deg, #1a1a2e 0%, #c62828 50%, #1a1a2e 100%);
    }
    .plan-section-carta .plan-section-header {
      text-align: center !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      border-bottom: 1px solid #ccc !important;
      padding-bottom: 16px !important;
      margin-bottom: 20px !important;
    }
    .plan-section-carta .plan-section-num {
      background: #c62828 !important;
      width: 36px !important; height: 36px !important;
      font-size: 14px !important;
      margin-bottom: 8px !important;
    }
    .plan-section-carta .plan-section-title {
      font-size: 22px !important;
      letter-spacing: 0.12em !important;
      text-transform: uppercase !important;
      color: #1a1a2e !important;
    }
    .plan-section-carta .plan-markdown .plan-markdown-p,
    .plan-section-carta .plan-markdown .plan-para,
    .plan-section-carta .carta-text {
      color: #222 !important;
      font-size: 12pt !important;
      line-height: 1.9 !important;
      font-style: italic;
      text-align: justify !important;
    }

    .plan-markdown .plan-para,
    .plan-markdown-p,
    .plan-markdown-li {
      color: #333 !important; font-size: 11.5pt !important;
      line-height: 1.6 !important;
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
      hyphens: auto !important;
      orphans: 3;
      widows: 3;
    }
    .plan-md-heading {
      color: #1a1a2e !important;
      border-bottom: 1px solid #ddd !important;
    }
    .plan-md-heading-sm { color: #1a1a2e !important; }

    /* Listas print */
    .plan-markdown-ul,
    .plan-markdown-ol {
      display: block !important;
      padding-left: 0 !important;
      margin: 4px 0 !important;
      list-style: none !important;
    }
    .plan-markdown-ol { counter-reset: plan-ol !important; }
    .plan-markdown-ol > .plan-markdown-li {
      counter-increment: plan-ol !important;
      padding-left: 30px !important;
      position: relative !important;
    }
    .plan-markdown-ol > .plan-markdown-li::before {
      content: counter(plan-ol) !important;
      position: absolute !important; left: 0 !important; top: 2px !important;
      width: 20px !important; height: 20px !important; border-radius: 50% !important;
      background: #1a1a2e !important; color: #fff !important;
      font-size: 10px !important; font-weight: 700 !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .plan-markdown-ul > .plan-markdown-li {
      padding-left: 18px !important;
      position: relative !important;
    }
    .plan-markdown-ul > .plan-markdown-li::before {
      content: '' !important;
      position: absolute !important; left: 2px !important; top: 7px !important;
      width: 7px !important; height: 7px !important; border-radius: 50% !important;
      background: #1a1a2e !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .plan-markdown-li {
      margin: 0.4em 0 !important;
      page-break-before: auto !important;
      break-before: auto !important;
    }

    /* ---- PRINT FOOTER ---- */
    .print-footer {
      display: block !important;
      padding: 0 42px 26px;
    }
    .print-footer-line {
      border-top: 2px solid #1a1a2e; margin-bottom: 12px;
    }
    .print-footer-content {
      display: flex; justify-content: space-between;
      font-size: 9px; color: #888 !important; letter-spacing: 0.08em;
    }
  }
`
