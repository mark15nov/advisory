import { readFileSync } from 'fs'
import express from 'express'
import {
  scoreAdvisoryRows,
  pickTopAdvisoryCandidates,
  buildAdvisoryContext,
  normalizeClientAdvisoryCandidates,
} from './src/lib/advisoryPick.js'
import { verifySupabaseJwt, getBearerTokenFromRequest } from './src/lib/verifySupabaseJwt.js'

function loadEnvFromFile(relPath) {
  try {
    const env = readFileSync(relPath, 'utf-8')
    for (const line of env.split('\n')) {
      const [key, ...val] = line.split('=')
      if (key && val.length) process.env[key.trim()] = val.join('=').trim()
    }
  } catch {}
}
loadEnvFromFile('.env')
loadEnvFromFile('.env.local')

const app = express()
app.use(express.json())

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || ''
const ANTHROPIC_MODEL_CANDIDATES = (process.env.ANTHROPIC_MODEL_CANDIDATES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const DEFAULT_MODEL_CANDIDATES = [
  'claude-3-5-sonnet-20240620',
  'claude-3-haiku-20240307',
]

if (!ANTHROPIC_API_KEY) {
  console.error('❌ Falta ANTHROPIC_API_KEY en .env o .env.local')
  process.exit(1)
}

const MAX_RETRIES = 3

async function requireSupabaseAuth(req, res, next) {
  const token = getBearerTokenFromRequest(req)
  if (!token) {
    return res.status(401).json({ error: { message: 'Sesión requerida. Inicia sesión de nuevo.' } })
  }
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: { message: 'Supabase no configurado en el servidor' } })
  }
  const { user } = await verifySupabaseJwt(token, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  if (!user) {
    return res.status(401).json({ error: { message: 'Sesión inválida o expirada' } })
  }
  req.authUser = user
  next()
}

async function fetchAdvisoryCandidates(profile) {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !profile) return []

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
  const rows = Array.isArray(raw) ? raw.filter((r) => r.activo !== false) : []
  const sorted = scoreAdvisoryRows(rows, profile)
  return pickTopAdvisoryCandidates(sorted)
}

app.post('/api/advisory-recommendations', requireSupabaseAuth, async (req, res) => {
  const profile = req.body
  if (!profile || typeof profile !== 'object') {
    return res.status(400).json({ error: { message: 'Body inválido' } })
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: { message: 'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el servidor' } })
  }
  try {
    const candidates = await fetchAdvisoryCandidates(profile)
    const sanitized = candidates.map((c) => ({
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
    res.json({ candidates: sanitized })
  } catch (err) {
    console.error('advisory-recommendations:', err)
    res.status(500).json({ error: { message: 'Error al consultar recomendaciones' } })
  }
})

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

async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

function extractBoundary(contentType = '') {
  const m = String(contentType).match(/boundary=([^;]+)/i)
  return m?.[1] ? m[1].trim() : ''
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

async function callAnthropic({ system, advisoryContext, messages, stream, maxTokens = 8192 }) {
  const systemPrompt = [system, advisoryContext].filter(Boolean).join('\n\n')
  const anthropicMessages = toAnthropicMessages(messages)
  const modelsToTry = Array.from(new Set([
    ANTHROPIC_MODEL,
    ...ANTHROPIC_MODEL_CANDIDATES,
    ...DEFAULT_MODEL_CANDIDATES,
  ].filter(Boolean)))

  if (!modelsToTry.length) {
    throw new Error('No hay modelo configurado. Define ANTHROPIC_MODEL en .env.local')
  }

  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
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
          messages: anthropicMessages,
          max_tokens: maxTokens,
          temperature: 0.3,
          stream,
        }),
      })

      if (response.status === 429 && attempt < MAX_RETRIES) {
        const wait = attempt * 5
        console.log(`Rate limit (${model}), reintentando en ${wait}s... (intento ${attempt}/${MAX_RETRIES})`)
        await new Promise(r => setTimeout(r, wait * 1000))
        continue
      }
      if (response.status === 503 && attempt < MAX_RETRIES) {
        const wait = attempt * 5
        console.log(`Anthropic saturado (${model}), reintentando en ${wait}s... (intento ${attempt}/${MAX_RETRIES})`)
        await new Promise(r => setTimeout(r, wait * 1000))
        continue
      }
      if (response.status === 404) {
        const rawError = await response.text()
        const parsed = parseAnthropicError(rawError)
        if (parsed.type === 'not_found_error' || String(parsed.message).toLowerCase().includes('model:')) {
          console.log(`Modelo no disponible (${model}), probando siguiente...`)
          break
        }
        return response
      }

      return response
    }
  }

  return new Response(JSON.stringify({
    error: {
      type: 'not_found_error',
      message: `No se encontró un modelo válido en ANTHROPIC_MODEL/ANTHROPIC_MODEL_CANDIDATES. Probados: ${modelsToTry.join(', ')}`,
    },
  }), { status: 404, headers: { 'Content-Type': 'application/json' } })
}

app.post('/api/chat', requireSupabaseAuth, async (req, res) => {
  const {
    system,
    messages,
    stream,
    advisoryProfile,
    advisoryCandidatesFromClient,
    skipAdvisoryContext,
  } = req.body

  let advisoryContext = ''
  if (!skipAdvisoryContext) {
    const advisoryCandidates = Array.isArray(advisoryCandidatesFromClient)
      ? normalizeClientAdvisoryCandidates(advisoryCandidatesFromClient)
      : await fetchAdvisoryCandidates(advisoryProfile)
    advisoryContext = buildAdvisoryContext(advisoryCandidates)
  }

  try {
    const response = await callAnthropic({
      system,
      advisoryContext,
      messages,
      stream: !!stream,
    })

    if (!response.ok) {
      const rawError = await response.text()
      console.error('Anthropic error:', rawError)
      return res.status(response.status).json({
        error: { message: extractAnthropicErrorMessage(rawError) || 'Error de Anthropic' },
      })
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

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
              if (parsed.type === 'message_stop') {
                res.write('data: [DONE]\n\n')
                continue
              }
              const text = parsed?.delta?.text || ''
              if (text) {
                res.write(`data: ${JSON.stringify({ text })}\n\n`)
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
          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'message_stop') {
              res.write('data: [DONE]\n\n')
              continue
            }
            const text = parsed?.delta?.text || ''
            if (text) {
              res.write(`data: ${JSON.stringify({ text })}\n\n`)
            }
          } catch {}
        }
      }
      res.end()
    } else {
      const data = await response.json()
      const text = (data.content || [])
        .filter((b) => b?.type === 'text')
        .map((b) => b.text || '')
        .join('')
      res.json({ text })
    }
  } catch (err) {
    console.error('Proxy error:', err)
    res.status(500).json({ error: { message: 'Error interno del proxy' } })
  }
})

app.post('/api/transcribe', requireSupabaseAuth, async (req, res) => {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
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
})

app.listen(3001, () => {
  console.log('🔌 Proxy Anthropic corriendo en http://localhost:3001')
})
