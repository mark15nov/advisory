import {
  scoreAdvisoryRows,
  scoreAdvisoryRowsByGeneratedPlan,
  pickTopAdvisoryCandidates,
  buildAdvisoryContext,
  normalizeClientAdvisoryCandidates,
} from '../lib/advisoryPick.js'
import { verifySupabaseJwt, getBearerTokenFromRequest } from '../lib/verifySupabaseJwt.js'

const DEFAULT_MODEL_CANDIDATES = [
  'claude-3-5-sonnet-20240620',
  'claude-3-haiku-20240307',
]

const SCORECARD_SUSPICIOUS_TRIPLES = new Set([
  '9-6-9',
  '7-5-8',
])

function envConfig() {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY || '',
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || '',
    ANTHROPIC_MODEL_CANDIDATES: (process.env.ANTHROPIC_MODEL_CANDIDATES || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  }
}

function toAnthropicMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: String(m.content || '') }))
}

function extractAnthropicErrorMessage(rawError) {
  try {
    const parsed = JSON.parse(rawError)
    return parsed?.error?.message || rawError
  } catch {
    return rawError
  }
}

function parseAnthropicError(rawError) {
  try {
    const parsed = JSON.parse(rawError)
    return {
      type: parsed?.error?.type || '',
      message: parsed?.error?.message || rawError,
    }
  } catch {
    return { type: '', message: rawError }
  }
}

async function requireSupabaseUser(req, res) {
  const token = getBearerTokenFromRequest(req)
  if (!token) {
    res.status(401).json({ error: { message: 'Sesión requerida. Inicia sesión de nuevo.' } })
    return null
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = envConfig()
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(503).json({ error: { message: 'Supabase no configurado en el servidor' } })
    return null
  }

  const { user } = await verifySupabaseJwt(token, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  if (!user) {
    res.status(401).json({ error: { message: 'Sesión inválida o expirada' } })
    return null
  }

  req.authUser = user
  return user
}

async function fetchAdvisoryRows() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = envConfig()
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return []

  const params = new URLSearchParams({
    select: 'id,nombre,empresa,web,email,productos_servicios,especialidades,industrias,etapas,ubicacion,bio,experiencia_anios,score,activo',
    limit: '500',
  })

  const response = await fetch(`${SUPABASE_URL}/rest/v1/advisory?${params.toString()}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  })
  if (!response.ok) return []

  const raw = await response.json()
  return Array.isArray(raw) ? raw.filter((r) => r.activo !== false) : []
}

async function fetchAdvisoryCandidates(profile) {
  if (!profile) return []
  const rows = await fetchAdvisoryRows()
  return pickTopAdvisoryCandidates(scoreAdvisoryRows(rows, profile))
}

async function rerankAdvisoryCandidatesByPlan(profile, reportText) {
  if (!profile || !reportText) return []
  const rows = await fetchAdvisoryRows()
  return pickTopAdvisoryCandidates(scoreAdvisoryRowsByGeneratedPlan(rows, profile, reportText))
}

function sanitizeAdvisoryCandidates(candidates) {
  return candidates.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    empresa: c.empresa,
    web: c.web,
    email: c.email,
    bio: c.bio,
    productos_servicios: c.productos_servicios,
    especialidades: c.especialidades,
    industrias: c.industrias,
    ubicacion: c.ubicacion,
    fitScore: c.fitScore,
    fitSummary: c.fitSummary,
  }))
}

async function callAnthropic({ systemPrompt, messages, stream, maxTokens = 8192 }) {
  const { ANTHROPIC_API_KEY, ANTHROPIC_MODEL, ANTHROPIC_MODEL_CANDIDATES } = envConfig()
  const modelsToTry = Array.from(new Set([
    ANTHROPIC_MODEL,
    ...ANTHROPIC_MODEL_CANDIDATES,
    ...DEFAULT_MODEL_CANDIDATES,
  ].filter(Boolean)))

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({
      error: { message: 'API key no configurada' },
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  if (!modelsToTry.length) {
    return new Response(JSON.stringify({
      error: { message: 'No se encontró un modelo válido configurado' },
    }), { status: 404, headers: { 'Content-Type': 'application/json' } })
  }

  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          system: systemPrompt,
          messages,
          max_tokens: maxTokens,
          temperature: 0.3,
          stream: !!stream,
        }),
      })

      if ((response.status === 429 || response.status === 503) && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 5000))
        continue
      }

      if (response.status === 404) {
        const rawError = await response.text()
        const parsed = parseAnthropicError(rawError)
        if (parsed.type === 'not_found_error' || String(parsed.message).toLowerCase().includes('model:')) {
          break
        }
        return new Response(rawError, { status: 404, headers: { 'Content-Type': 'application/json' } })
      }

      return { response, selectedModel: model, modelsToTry }
    }
  }

  return {
    response: new Response(JSON.stringify({
      error: {
        type: 'not_found_error',
        message: `No se encontró un modelo válido. Probados: ${modelsToTry.join(', ')}`,
      },
    }), { status: 404, headers: { 'Content-Type': 'application/json' } }),
    selectedModel: '',
    modelsToTry,
  }
}

async function collectAnthropicStreamText(response) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const events = buffer.split('\n\n')
    buffer = events.pop() || ''

    for (const event of events) {
      const lines = event.split('\n')
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6)
        try {
          const parsed = JSON.parse(data)
          const text = parsed?.delta?.text || ''
          if (text) fullText += text
        } catch {}
      }
    }
  }

  if (buffer.trim()) {
    const lines = buffer.split('\n')
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      try {
        const parsed = JSON.parse(data)
        const text = parsed?.delta?.text || ''
        if (text) fullText += text
      } catch {}
    }
  }

  return fullText
}

async function relayAnthropicStreamToClient(response, onTextChunk) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const events = buffer.split('\n\n')
    buffer = events.pop() || ''

    for (const event of events) {
      const lines = event.split('\n')
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6)
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          const text = parsed?.delta?.text || ''
          if (text) {
            fullText += text
            onTextChunk(text)
          }
        } catch {}
      }
    }
  }

  if (buffer.trim()) {
    const lines = buffer.split('\n')
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') continue
      try {
        const parsed = JSON.parse(data)
        const text = parsed?.delta?.text || ''
        if (text) {
          fullText += text
          onTextChunk(text)
        }
      } catch {}
    }
  }

  return fullText
}

function parseScorecard(text = '') {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n')
  const out = {}
  for (const line of lines) {
    const cleaned = line.replace(/\*\*/g, '').trim()
    const m = cleaned.match(/^(URGENCIA|COMPLEJIDAD|OPORTUNIDAD):\s*([1-9]|10)\/10\s*-\s*(.+)$/i)
    if (m) {
      out[m[1].toUpperCase()] = { score: Number(m[2]), reason: m[3].trim() }
    }
  }
  return out
}

function hasValidScorecard(text = '') {
  const sc = parseScorecard(text)
  return Boolean(sc.URGENCIA && sc.COMPLEJIDAD && sc.OPORTUNIDAD)
}

function isSuspiciousScorecard(text = '') {
  const sc = parseScorecard(text)
  if (!(sc.URGENCIA && sc.COMPLEJIDAD && sc.OPORTUNIDAD)) return false
  const key = `${sc.URGENCIA.score}-${sc.COMPLEJIDAD.score}-${sc.OPORTUNIDAD.score}`
  return SCORECARD_SUSPICIOUS_TRIPLES.has(key)
}

function replaceScorecardSection(report = '', scorecardLines = '') {
  const normalized = String(report).replace(/\r\n/g, '\n')
  const replacement = `## SCORECARD\n${scorecardLines.trim()}`
  const sectionRegex = /##\s*SCORECARD[\s\S]*?(?=\n##\s+[^\n]+|$)/i
  if (sectionRegex.test(normalized)) return normalized.replace(sectionRegex, replacement)
  return `${replacement}\n\n${normalized}`.trim()
}

async function anthropicText({ apiKey, model, systemPrompt, messages, maxTokens = 900, temperature = 0.2 }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false,
    }),
  })
  if (!response.ok) return ''
  const data = await response.json()
  return (data.content || [])
    .filter((b) => b?.type === 'text')
    .map((b) => b.text || '')
    .join('')
}

async function ensureScorecardQuality({ text, enabled, apiKey, model, systemPrompt }) {
  if (!enabled) return text

  const invalid = !hasValidScorecard(text)
  const suspicious = isSuspiciousScorecard(text)
  if (!invalid && !suspicious) return text

  const scorecardOnly = await anthropicText({
    apiKey,
    model,
    systemPrompt,
    messages: [{
      role: 'user',
      content: `Corrige SOLO la sección SCORECARD del siguiente informe.

Devuelve exactamente 3 líneas en este orden y formato:
URGENCIA: [1-10]/10 - [1 oración]
COMPLEJIDAD: [1-10]/10 - [1 oración]
OPORTUNIDAD: [1-10]/10 - [1 oración]

No incluyas encabezados, viñetas, explicación adicional ni texto extra.

INFORME:
${text}`,
    }],
    maxTokens: 300,
    temperature: 0.1,
  })

  if (!hasValidScorecard(scorecardOnly)) return text
  return replaceScorecardSection(text, scorecardOnly)
}

function extractSectionText(report = '', headingRegex) {
  const lines = String(report || '').replace(/\r\n/g, '\n').split('\n')
  const out = []
  let inSection = false
  for (const line of lines) {
    const m = line.match(/^##\s+(.+)$/)
    if (m) {
      const title = String(m[1] || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
      if (headingRegex.test(title)) {
        inSection = true
        continue
      }
      if (inSection) break
    }
    if (inSection) out.push(line)
  }
  return out.join('\n').trim()
}

function buildAdvisorsSectionFromCandidates(candidates = []) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return '## ADVISORS RECOMENDADOS\nSin candidatos disponibles en la base de datos para este caso.'
  }

  const lines = ['## ADVISORS RECOMENDADOS']
  candidates.forEach((c, i) => {
    const score = Number(c.fitScore || 0)
    const ajuste = score >= 18 ? 'ALTO' : 'MEDIO'
    const specialties = Array.isArray(c.especialidades) ? c.especialidades.filter(Boolean) : []
    const specialty = specialties[0] || c.industrias?.[0] || 'Asesoría estratégica empresarial'
    const why = String(c.fitSummary || '').trim() || 'Puede ayudar a ejecutar y acelerar acciones clave del plan de 90 días.'
    lines.push(`${i + 1}. ${c.nombre} - Ajuste: ${ajuste}`)
    lines.push(`- Especialidad clave: ${specialty}`)
    lines.push(`- Justificación: ${why}`)
    lines.push('')
  })
  return lines.join('\n').trim()
}

function replaceOrInsertAdvisorsSection(report = '', advisorsSection = '') {
  const text = String(report || '').replace(/\r\n/g, '\n')
  if (!text.trim()) return advisorsSection

  const sectionRegex = /##\s*ADVISORS RECOMENDADOS[\s\S]*?(?=\n##\s+[^\n]+|$)/i
  if (sectionRegex.test(text)) {
    return text.replace(sectionRegex, advisorsSection.trim())
  }

  const cartaRegex = /\n##\s*CARTA DEL CONSEJO/i
  if (cartaRegex.test(text)) {
    return text.replace(cartaRegex, `\n\n${advisorsSection.trim()}\n\n## CARTA DEL CONSEJO`)
  }

  return `${text.trim()}\n\n${advisorsSection.trim()}`
}

async function readRawBody(req) {
  if (req.body && Buffer.isBuffer(req.body)) return req.body
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

function extractBoundary(contentType = '') {
  const match = String(contentType).match(/boundary=([^;]+)/i)
  return match?.[1] ? match[1].trim() : ''
}

function parseMultipartAudio(buffer, boundary) {
  const body = buffer.toString('binary')
  const marker = `--${boundary}`
  const sections = body.split(marker)

  for (const section of sections) {
    if (!section.includes('name="audio"')) continue
    const splitIndex = section.indexOf('\r\n\r\n')
    if (splitIndex === -1) continue

    const rawHeaders = section.slice(0, splitIndex)
    const contentTypeMatch = rawHeaders.match(/Content-Type:\s*([^\r\n]+)/i)
    const fileNameMatch = rawHeaders.match(/filename="([^"]+)"/i)
    const mimeType = contentTypeMatch?.[1]?.trim() || 'audio/webm'
    const filename = fileNameMatch?.[1]?.trim() || 'audio.webm'

    let dataPart = section.slice(splitIndex + 4)
    dataPart = dataPart.replace(/\r\n--$/, '').replace(/\r\n$/, '')
    const audioBuffer = Buffer.from(dataPart, 'binary')
    return { audioBuffer, mimeType, filename }
  }

  return null
}

export async function handleAdvisoryRecommendations(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } })
  }

  const user = await requireSupabaseUser(req, res)
  if (!user) return

  const profile = req.body
  if (!profile || typeof profile !== 'object') {
    return res.status(400).json({ error: { message: 'Body inválido' } })
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = envConfig()
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: { message: 'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el servidor' } })
  }

  try {
    const candidates = String(profile?.planText || '').trim()
      ? await rerankAdvisoryCandidatesByPlan(profile, profile.planText)
      : await fetchAdvisoryCandidates(profile)
    return res.status(200).json({ candidates: sanitizeAdvisoryCandidates(candidates) })
  } catch (err) {
    console.error('advisory-recommendations:', err)
    return res.status(500).json({ error: { message: 'Error al consultar recomendaciones' } })
  }
}

export async function handleChat(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } })
  }

  const user = await requireSupabaseUser(req, res)
  if (!user) return

  const {
    system,
    messages,
    stream,
    advisoryProfile,
    advisoryCandidatesFromClient,
    skipAdvisoryContext,
  } = req.body || {}

  let advisoryContext = ''
  if (!skipAdvisoryContext) {
    const advisoryCandidates = Array.isArray(advisoryCandidatesFromClient)
      ? normalizeClientAdvisoryCandidates(advisoryCandidatesFromClient)
      : await fetchAdvisoryCandidates(advisoryProfile)
    advisoryContext = buildAdvisoryContext(advisoryCandidates)
  }

  const systemPrompt = [system, advisoryContext].filter(Boolean).join('\n\n')
  const anthropicMessages = toAnthropicMessages(messages)

  try {
    const { response, selectedModel, modelsToTry } = await callAnthropic({
      systemPrompt,
      messages: anthropicMessages,
      stream: !!stream,
    })

    if (!response.ok) {
      const rawError = await response.text()
      const parsedError = parseAnthropicError(rawError)
      console.error('Anthropic error:', rawError)
      if (response.status === 429 || response.status === 503) {
        res.setHeader('Retry-After', '8')
      }
      return res.status(response.status).json({
        error: {
          message: parsedError?.message || extractAnthropicErrorMessage(rawError) || `No se encontró un modelo válido. Probados: ${modelsToTry.join(', ')}`,
        },
      })
    }

    const { ANTHROPIC_API_KEY } = envConfig()
    const scorecardValidationEnabled = /##\s*SCORECARD/i.test(systemPrompt)

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      const streamedText = await relayAnthropicStreamToClient(response, (chunk) => {
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`)
      })

      let finalText = await ensureScorecardQuality({
        text: streamedText,
        enabled: scorecardValidationEnabled,
        apiKey: ANTHROPIC_API_KEY,
        model: selectedModel || modelsToTry[0],
        systemPrompt,
      })

      const planSectionText = extractSectionText(finalText, /^plan de accion$/i)
      if (advisoryProfile && planSectionText) {
        const topByPlan = await rerankAdvisoryCandidatesByPlan(advisoryProfile, finalText)
        if (topByPlan.length > 0) {
          finalText = replaceOrInsertAdvisorsSection(finalText, buildAdvisorsSectionFromCandidates(topByPlan))
        }
      }

      if (finalText && finalText !== streamedText) {
        res.write(`data: ${JSON.stringify({ text: finalText })}\n\n`)
      }
      res.write('data: [DONE]\n\n')
      return res.end()
    }

    const data = await response.json()
    const text = (data.content || [])
      .filter((b) => b?.type === 'text')
      .map((b) => b.text || '')
      .join('')

    let finalText = await ensureScorecardQuality({
      text,
      enabled: scorecardValidationEnabled,
      apiKey: ANTHROPIC_API_KEY,
      model: selectedModel || modelsToTry[0],
      systemPrompt,
    })

    const planSectionText = extractSectionText(finalText, /^plan de accion$/i)
    if (advisoryProfile && planSectionText) {
      const topByPlan = await rerankAdvisoryCandidatesByPlan(advisoryProfile, finalText)
      if (topByPlan.length > 0) {
        finalText = replaceOrInsertAdvisorsSection(finalText, buildAdvisorsSectionFromCandidates(topByPlan))
      }
    }

    return res.json({ text: finalText })
  } catch (err) {
    console.error('Proxy error:', err)
    return res.status(500).json({ error: { message: 'Error interno del servidor' } })
  }
}

export async function handleTranscribe(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } })
  }

  const user = await requireSupabaseUser(req, res)
  if (!user) return

  const { OPENAI_API_KEY } = envConfig()
  if (!OPENAI_API_KEY) {
    return res.status(503).json({
      error: { message: 'Falta OPENAI_API_KEY para transcripción de voz.' },
    })
  }

  try {
    const contentType = req.headers['content-type'] || ''
    const boundary = extractBoundary(contentType)
    if (!boundary) {
      return res.status(400).json({ error: { message: 'Content-Type multipart inválido.' } })
    }

    const rawBody = await readRawBody(req)
    const parsed = parseMultipartAudio(rawBody, boundary)
    if (!parsed?.audioBuffer?.length) {
      return res.status(400).json({ error: { message: 'No se recibió audio para transcribir.' } })
    }

    const form = new FormData()
    const blob = new Blob([parsed.audioBuffer], { type: parsed.mimeType || 'audio/webm' })
    form.append('file', blob, parsed.filename || 'audio.webm')
    form.append('model', 'whisper-1')
    form.append('language', 'es')

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
    })

    if (!response.ok) {
      const txt = await response.text()
      const lower = String(txt || '').toLowerCase()
      if (response.status === 429) {
        const isQuota = lower.includes('insufficient_quota') || lower.includes('quota')
        const message = isQuota
          ? 'Se alcanzó la cuota de OpenAI para transcripción. Revisa facturación/límites de la API key.'
          : 'Demasiadas solicitudes de transcripción. Espera unos segundos e intenta de nuevo.'
        res.setHeader('Retry-After', '20')
        return res.status(429).json({ error: { message } })
      }
      return res.status(response.status).json({ error: { message: txt || 'Error al transcribir audio.' } })
    }

    const data = await response.json()
    return res.status(200).json({ text: String(data?.text || '').trim() })
  } catch (err) {
    console.error('transcribe:', err)
    return res.status(500).json({ error: { message: 'Error interno en transcripción.' } })
  }
}
