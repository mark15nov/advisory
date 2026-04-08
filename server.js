import { readFileSync } from 'fs'
import express from 'express'
import {
  scoreAdvisoryRows,
  pickTopAdvisoryCandidates,
  buildAdvisoryContext,
} from './src/lib/advisoryPick.js'

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

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

if (!GEMINI_API_KEY) {
  console.error('❌ Falta GEMINI_API_KEY en .env o .env.local')
  process.exit(1)
}

const MAX_RETRIES = 3

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

app.post('/api/advisory-recommendations', async (req, res) => {
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
    }))
    res.json({ candidates: sanitized })
  } catch (err) {
    console.error('advisory-recommendations:', err)
    res.status(500).json({ error: { message: 'Error al consultar recomendaciones' } })
  }
})

async function callGemini(geminiMessages, stream, maxTokens = 8192) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GEMINI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        messages: geminiMessages,
        max_tokens: maxTokens,
        temperature: 0.3,
        stream,
      }),
    })

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const wait = attempt * 5
      console.log(`Rate limit, reintentando en ${wait}s... (intento ${attempt}/${MAX_RETRIES})`)
      await new Promise(r => setTimeout(r, wait * 1000))
      continue
    }

    return response
  }
}

app.post('/api/chat', async (req, res) => {
  const { system, messages, stream, advisoryProfile } = req.body
  const advisoryCandidates = await fetchAdvisoryCandidates(advisoryProfile)
  const advisoryContext = buildAdvisoryContext(advisoryCandidates)

  const geminiMessages = [
    { role: 'system', content: system },
    { role: 'system', content: advisoryContext },
    ...messages,
  ]

  try {
    const response = await callGemini(geminiMessages, !!stream)

    if (!response.ok) {
      const err = await response.json()
      console.error('Gemini error:', JSON.stringify(err))
      return res.status(response.status).json({ error: { message: err.error?.message || 'Error de Gemini' } })
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
            if (data === '[DONE]') {
              res.write('data: [DONE]\n\n')
              continue
            }
            try {
              const parsed = JSON.parse(data)
              const text = parsed.choices?.[0]?.delta?.content || ''
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
          if (data === '[DONE]') {
            res.write('data: [DONE]\n\n')
            continue
          }
          try {
            const parsed = JSON.parse(data)
            const text = parsed.choices?.[0]?.delta?.content || ''
            if (text) {
              res.write(`data: ${JSON.stringify({ text })}\n\n`)
            }
          } catch {}
        }
      }
      res.end()
    } else {
      const data = await response.json()
      const text = data.choices?.[0]?.message?.content || ''
      res.json({ text })
    }
  } catch (err) {
    console.error('Proxy error:', err)
    res.status(500).json({ error: { message: 'Error interno del proxy' } })
  }
})

app.listen(3001, () => {
  console.log('🔌 Proxy Gemini corriendo en http://localhost:3001')
})
