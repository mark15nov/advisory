// src/components/SynthesisPhase.jsx
import React, { useEffect, useState, useRef } from 'react'
import { Loader2, Sparkles, Printer } from 'lucide-react'
import { callClaude } from '../hooks/useClaude'
import { SYSTEM_PROMPTS } from '../lib/session'

export default function SynthesisPhase({ session, questionHistory, experts, onDone }) {
  const [output, setOutput] = useState('')
  const [done, setDone] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => { generate() }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [output])

  async function generate() {
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
      onChunk: (chunk) => { streamed += chunk; setOutput(streamed) },
    })
    setDone(true)
    onDone(streamed)
  }

  const sectionIcons = {
    'SCORECARD': '00',
    'DIAGNÓSTICO': '01',
    'TABLA COMPARATIVA: CONSEJO vs IA': '02',
    'PLAN DE ACCIÓN': '03',
    'PROYECCIÓN DE IMPACTO': '04',
    'MÉTRICAS DE ÉXITO': '05',
    'RIESGOS Y MITIGACIONES': '06',
    'HOJA DE RUTA: 90 DÍAS': '07',
    'CARTA DEL CONSEJO': '08',
  }

  function renderScorecard(content) {
    const metrics = []
    const lines = content.split('\n')
    for (const line of lines) {
      // Flexible: strip markdown bold, bullets, dashes, asterisks, spaces
      const cleaned = line.replace(/^[\s\-\*•]+/, '').replace(/\*\*/g, '').trim()
      const match = cleaned.match(/(URGENCIA|COMPLEJIDAD|OPORTUNIDAD)[:\s]+(\d+)\s*[\/de]+\s*10[\s\-–:]+(.+)/i)
      if (match) {
        metrics.push({ label: match[1].toUpperCase(), score: parseInt(match[2]), desc: match[3].trim() })
      }
    }
    if (metrics.length === 0) return null

    const colors = {
      'URGENCIA': { high: '#e74c3c', mid: '#f0ad4e', low: '#4caf7a' },
      'COMPLEJIDAD': { high: '#e74c3c', mid: '#f0ad4e', low: '#4caf7a' },
      'OPORTUNIDAD': { high: '#4caf7a', mid: '#f0ad4e', low: '#e74c3c' },
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
      const blockMatch = line.match(/^DÍAS?\s*(\d+[-–]\d+):\s*(.+)/i)
      if (blockMatch) {
        if (current) blocks.push(current)
        current = { range: blockMatch[1], title: blockMatch[2].trim(), items: [] }
      } else if (current && /^\d+\./.test(line.trim())) {
        current.items.push(line.trim().replace(/^\d+\.\s*/, ''))
      }
    }
    if (current) blocks.push(current)
    if (blocks.length === 0) return null

    const blockColors = ['#8b1a2b', '#0f1a2e', '#4caf7a']

    return (
      <div className="timeline-container">
        {blocks.map((block, i) => (
          <div key={i} className="timeline-block">
            <div className="timeline-header" style={{ background: blockColors[i] || blockColors[0] }}>
              <span className="timeline-range">{block.range}</span>
              <span className="timeline-title">{block.title}</span>
            </div>
            <div className="timeline-items">
              {block.items.map((item, j) => (
                <div key={j} className="timeline-item">
                  <span className="timeline-dot" style={{ background: blockColors[i] || blockColors[0] }} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  function renderCarta(content) {
    return (
      <div className="carta-container">
        <p className="carta-text">{content}</p>
      </div>
    )
  }

  function renderTable(lines) {
    // Parse markdown table lines
    const rows = lines
      .filter(l => l.trim().startsWith('|') && !l.trim().match(/^\|[\s-|]+\|$/))
      .map(l => l.split('|').slice(1, -1).map(c => c.trim()))

    if (rows.length < 2) return null
    const headers = rows[0]
    const body = rows.slice(1)

    return (
      <div className="plan-table-wrapper">
        <table className="plan-table">
          <thead>
            <tr>
              {headers.map((h, i) => <th key={i}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {body.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => {
                  // Color the coincidence column
                  const isLast = j === row.length - 1
                  let cellClass = ''
                  if (isLast) {
                    const lower = cell.toLowerCase()
                    if (lower.includes('alta')) cellClass = 'coincidence-high'
                    else if (lower.includes('media')) cellClass = 'coincidence-mid'
                    else if (lower.includes('baja')) cellClass = 'coincidence-low'
                  }
                  return <td key={j} className={cellClass}>{cell}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const renderOutput = (text) => {
    const cleaned = text.replace(/^##\s+/, '')
    const sections = cleaned.split(/\n## /).filter(Boolean)
    return sections.map((section, i) => {
      const [heading, ...rest] = section.split('\n')
      const title = heading.replace(/^#+\s*/, '')
      const content = rest.join('\n').trim()
      const num = sectionIcons[title] || String(i + 1).padStart(2, '0')

      // Special renders by section type
      const isScorecard = title.toUpperCase() === 'SCORECARD'
      const isTimeline = title.toUpperCase().includes('HOJA DE RUTA')
      const isCarta = title.toUpperCase().includes('CARTA DEL CONSEJO')

      const allLines = content.split('\n')
      const tableLines = allLines.filter(l => l.trim().startsWith('|'))
      const nonTableLines = allLines.filter(l => !l.trim().startsWith('|'))
      const hasTable = tableLines.length >= 3

      return (
        <div key={i} className={`plan-section ${isCarta ? 'plan-section-carta' : ''}`}>
          <div className="plan-section-header">
            <span className="plan-section-num">{num}</span>
            <h3 className="plan-section-title">{title}</h3>
          </div>
          <div className="plan-section-content">
            {isScorecard && renderScorecard(content)}
            {isTimeline && renderTimeline(content)}
            {isCarta && renderCarta(content)}
            {!isScorecard && !isTimeline && !isCarta && hasTable && renderTable(tableLines)}
            {!isScorecard && !isTimeline && !isCarta && nonTableLines.map((line, j) => {
              if (!line.trim()) return null
              if (/^\d+\./.test(line)) {
                return (
                  <div key={j} className="plan-numbered">
                    <span className="plan-num">{line.match(/^(\d+)\./)?.[1]}</span>
                    <span className="plan-num-text">{line.replace(/^\d+\.\s*/, '')}</span>
                  </div>
                )
              }
              if (line.startsWith('- ') || line.startsWith('* ')) {
                return <div key={j} className="plan-bullet">{line.replace(/^[-*]\s*/, '')}</div>
              }
              return <p key={j} className="plan-para">{line}</p>
            })}
          </div>
        </div>
      )
    })
  }

  const printDate = new Date().toLocaleDateString('es-MX', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  const expertNames = experts.filter(e => e.name?.trim()).map(e => e.name.trim())

  return (
    <div className="synthesis-root">
      {/* === COVER PAGE (print only) === */}
      <div className="print-cover">
        <div className="cover-top-bar" />
        <div className="cover-body">
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

      {/* === SCREEN HEADER === */}
      <div className="screen-header">
        <div className="screen-badge"><Sparkles size={13} /> PLAN DE ACCIÓN</div>
        <h2 className="screen-title">Plan de acción ejecutivo</h2>
        <div className="screen-meta">
          {session.presenter} · {session.company || 'Sesión del foro'} · {expertNames.length} consejeros
        </div>
      </div>

      {!output && (
        <div className="synthesis-loading">
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          <span>Sintetizando opiniones y generando plan...</span>
        </div>
      )}

      {/* === PLAN CONTENT === */}
      <div className="plan-output">
        {/* Print page header (repeats on each page via running header) */}
        <div className="print-page-header">
          <span className="pph-brand">Advisory Business Boards</span>
          <span className="pph-sep">·</span>
          <span className="pph-company">{session.company || session.presenter}</span>
          <span className="pph-sep">·</span>
          <span className="pph-date">{printDate}</span>
        </div>

        {renderOutput(output)}

        {!done && output && <span className="synthesis-cursor">|</span>}
        <div ref={bottomRef} />
      </div>

      {/* Print footer */}
      <div className="print-footer">
        <div className="print-footer-line" />
        <div className="print-footer-content">
          <span>Advisory Business Boards · CONSILIUM</span>
          <span>Documento confidencial · {printDate}</span>
        </div>
      </div>

      {done && (
        <div className="synthesis-footer">
          <button className="print-btn" onClick={() => window.print()}>
            <Printer size={16} /> Exportar / Imprimir
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes blink { 0%,100% { opacity: 1 } 50% { opacity: 0 } }

        /* ===== SCREEN STYLES ===== */
        .synthesis-root {
          display: flex; flex-direction: column; gap: 24px;
          max-width: 800px; margin: 0 auto; padding: 40px 24px;
          height: 100%; overflow-y: auto;
        }
        .print-cover, .print-page-header, .print-footer { display: none; }

        .screen-header { display: flex; flex-direction: column; gap: 10px; }
        .screen-badge {
          display: inline-flex; align-self: flex-start; align-items: center; gap: 6px;
          font-size: 11px; font-weight: 600; letter-spacing: 0.12em;
          color: var(--gold); border: 1px solid var(--gold);
          padding: 4px 10px; border-radius: 2px;
        }
        .screen-title { font-family: var(--font-display); font-size: 32px; font-weight: 700; color: var(--text); }
        .screen-meta { font-size: 13px; color: var(--text-muted); }

        .synthesis-loading {
          display: flex; align-items: center; gap: 10px;
          color: var(--text-muted); font-size: 14px; padding: 40px 0;
        }

        .plan-output { display: flex; flex-direction: column; gap: 20px; padding-bottom: 40px; }

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
        .plan-section-content { display: flex; flex-direction: column; gap: 10px; }

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
          background: var(--gold); color: #fff;
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
        .plan-table tr:nth-child(even) td { background: rgba(255,255,255,0.03); }
        .plan-table tr:hover td { background: rgba(255,255,255,0.05); }
        .coincidence-high {
          color: var(--green) !important; font-weight: 600;
        }
        .coincidence-mid {
          color: #f0ad4e !important; font-weight: 600;
        }
        .coincidence-low {
          color: var(--red) !important; font-weight: 600;
        }

        .plan-para { font-size: 14px; color: var(--text); line-height: 1.7; margin: 0; word-wrap: break-word; overflow-wrap: break-word; }
        .plan-numbered { display: flex; gap: 14px; align-items: flex-start; font-size: 14px; color: var(--text); line-height: 1.7; }
        .plan-num {
          flex-shrink: 0; width: 24px; height: 24px;
          background: var(--gold-dim); border: 1px solid var(--gold); border-radius: 4px;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700; color: var(--gold); font-family: var(--font-mono); margin-top: 2px;
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
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 0;
        }
        .timeline-block {
          display: flex; flex-direction: column;
          border: 1px solid var(--border); overflow: hidden;
        }
        .timeline-block:first-child { border-radius: 8px 0 0 8px; }
        .timeline-block:last-child { border-radius: 0 8px 8px 0; }
        .timeline-block:not(:last-child) { border-right: none; }
        .timeline-header {
          padding: 14px 16px; color: #fff;
          display: flex; flex-direction: column; gap: 2px;
        }
        .timeline-range { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; opacity: 0.8; }
        .timeline-title { font-size: 13px; font-weight: 600; }
        .timeline-items {
          padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; flex: 1;
          background: var(--surface-2);
        }
        .timeline-item {
          display: flex; align-items: flex-start; gap: 10px;
          font-size: 13px; color: var(--text); line-height: 1.5;
        }
        .timeline-dot {
          width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex-shrink: 0;
        }

        /* Carta */
        .plan-section-carta {
          background: var(--gold-dim) !important;
          border-color: var(--gold) !important;
        }
        .carta-container { padding: 8px 0; }
        .carta-text {
          font-size: 15px; color: var(--text); line-height: 1.8;
          font-style: italic; margin: 0;
        }

        .synthesis-cursor { display: inline-block; animation: blink 0.8s infinite; color: var(--gold); font-size: 18px; }
        .synthesis-footer { display: flex; justify-content: center; padding-bottom: 32px; padding-top: 8px; }
        .print-btn {
          display: flex; align-items: center; gap: 10px;
          background: var(--gold); border: none; color: #fff; border-radius: 6px;
          padding: 14px 36px; font-size: 15px; font-weight: 700;
          letter-spacing: 0.04em; cursor: pointer; font-family: var(--font-body);
        }

        /* ===== PRINT STYLES ===== */
        @media print {
          *, *::before, *::after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          @page { margin: 3cm 2cm; size: letter; }

          html, body, #root, main {
            background: white !important;
            overflow: visible !important;
            height: auto !important;
            margin: 0 !important; padding: 0 !important;
          }

          nav, .synthesis-footer, .synthesis-loading, .synthesis-cursor, .screen-header, button {
            display: none !important;
          }

          .synthesis-root {
            max-width: 100% !important; padding: 0 !important;
            overflow: visible !important; height: auto !important; gap: 0 !important;
            display: block !important;
          }

          /* Force all parent containers to be visible */
          .synthesis-root, .synthesis-root * {
            overflow: visible !important;
          }

          /* ---- COVER PAGE ---- */
          .print-cover {
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            min-height: calc(100vh - 6cm) !important;
            background: #0f1a2e !important;
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
            background: #8b1a2b !important;
          }
          .cover-body {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
            padding: 60px 80px;
          }
          .cover-badge {
            font-size: 12px; font-weight: 700; letter-spacing: 0.25em;
            color: #8b1a2b !important; background: rgba(139,26,43,0.15) !important;
            padding: 6px 16px; border-radius: 3px;
            display: inline-block; align-self: flex-start; margin-bottom: 24px;
          }
          .cover-title {
            font-family: var(--font-display); font-size: 48px; font-weight: 700;
            color: white !important; line-height: 1.15; margin: 0 0 20px 0;
          }
          .cover-divider { width: 60px; height: 4px; background: #8b1a2b !important; margin-bottom: 24px; border-radius: 2px; }
          .cover-company {
            font-size: 22px; font-weight: 600; color: #9ba4b8 !important;
            margin-bottom: 16px;
          }
          .cover-problem {
            font-size: 14px; color: #6b7590 !important; line-height: 1.7;
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
            display: flex; justify-content: space-between; padding: 20px 80px;
            border-top: 1px solid rgba(255,255,255,0.08);
            font-size: 10px; color: #6b7590 !important; letter-spacing: 0.08em;
          }

          /* ---- CONTENT PAGES ---- */
          .plan-output {
            padding: 50px 60px 40px !important; gap: 0 !important;
          }

          .print-page-header {
            display: flex !important;
            align-items: center; gap: 8px;
            padding-bottom: 16px; margin-bottom: 28px;
            border-bottom: 2px solid #0f1a2e;
            font-size: 10px; letter-spacing: 0.06em; color: #888 !important;
          }
          .pph-brand { font-weight: 700; color: #0f1a2e !important; }
          .pph-sep { color: #ccc !important; }
          .pph-company { color: #555 !important; }
          .pph-date { color: #888 !important; }

          .plan-section {
            background: white !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 0 28px 0 !important;
            margin-bottom: 28px;
            border-bottom: 1px solid #e0e0e0 !important;
            /* Allow sections to break across pages */
            page-break-inside: auto;
            break-inside: auto;
          }
          .plan-section:last-child {
            border-bottom: none !important;
          }

          .plan-section-header {
            border-bottom: none !important;
            padding-bottom: 8px !important;
            margin-bottom: 4px;
            /* Keep header with at least some content */
            page-break-after: avoid;
            break-after: avoid;
          }

          .plan-section-num {
            background: #0f1a2e !important;
            color: white !important;
            width: 28px !important; height: 28px !important;
            font-size: 11px !important; border-radius: 3px !important;
          }

          .plan-section-title {
            color: #0f1a2e !important;
            font-size: 16px !important;
            font-weight: 700 !important;
            letter-spacing: 0.04em !important;
          }

          .plan-section-content {
            gap: 8px !important;
          }

          .plan-para {
            color: #333 !important; font-size: 12px !important; line-height: 1.7 !important;
            overflow: visible !important; white-space: normal !important;
            word-wrap: break-word !important; overflow-wrap: break-word !important;
          }

          .plan-numbered {
            color: #333 !important; font-size: 12px !important; line-height: 1.7 !important;
            gap: 10px !important;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .plan-num-text {
            color: #333 !important; font-size: 12px !important;
            overflow: visible !important; white-space: normal !important;
            word-wrap: break-word !important; overflow-wrap: break-word !important;
          }

          .plan-num {
            background: #0f1a2e !important; color: white !important;
            border: none !important; border-radius: 3px !important;
            width: 22px !important; height: 22px !important; font-size: 10px !important;
          }

          .plan-bullet {
            color: #333 !important; font-size: 12px !important; line-height: 1.7 !important;
            overflow: visible !important; white-space: normal !important;
            word-wrap: break-word !important; overflow-wrap: break-word !important;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .plan-bullet::before { background: #8b1a2b !important; }

          /* Table print styles */
          .plan-table-wrapper {
            border: 1px solid #ccc !important;
            border-radius: 0 !important;
            overflow: visible !important;
          }
          .plan-table { font-size: 10px !important; }
          .plan-table th {
            background: #0f1a2e !important;
            color: white !important;
            padding: 8px 10px !important;
            font-size: 9px !important;
          }
          .plan-table td {
            padding: 8px 10px !important;
            color: #333 !important;
            border-bottom: 1px solid #ddd !important;
            font-size: 10px !important;
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
            grid-template-columns: repeat(3, 1fr) !important;
          }
          .timeline-block {
            border: 1px solid #ccc !important;
          }
          .timeline-header {
            padding: 10px 12px !important;
          }
          .timeline-range { font-size: 10px !important; }
          .timeline-title { font-size: 11px !important; }
          .timeline-items { background: #fafafa !important; padding: 10px 12px !important; }
          .timeline-item { font-size: 11px !important; color: #333 !important; }

          /* Carta print */
          .plan-section-carta {
            background: #f5f0f1 !important;
            border: 1px solid #8b1a2b !important;
            border-left: 4px solid #8b1a2b !important;
          }
          .carta-text {
            color: #333 !important; font-size: 12px !important;
            line-height: 1.7 !important;
          }

          /* ---- PRINT FOOTER ---- */
          .print-footer {
            display: block !important;
            padding: 0 60px 40px;
          }
          .print-footer-line {
            border-top: 2px solid #0f1a2e; margin-bottom: 12px;
          }
          .print-footer-content {
            display: flex; justify-content: space-between;
            font-size: 9px; color: #888 !important; letter-spacing: 0.08em;
          }
        }
      `}</style>
    </div>
  )
}
