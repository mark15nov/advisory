import {
  scoreAdvisoryRows,
  pickTopAdvisoryCandidates,
  buildAdvisoryContext,
  normalizeClientAdvisoryCandidates,
} from '../src/lib/advisoryPick.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } })
  }

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
    return res.status(500).json({ error: { message: 'API key no configurada' } })
  }

  const {
    system,
    messages,
    stream,
    advisoryProfile,
    advisoryCandidatesFromClient,
    skipAdvisoryContext,
  } = req.body

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

  let advisoryContext = ''
  if (!skipAdvisoryContext) {
    const advisoryCandidates = Array.isArray(advisoryCandidatesFromClient)
      ? normalizeClientAdvisoryCandidates(advisoryCandidatesFromClient)
      : await fetchAdvisoryCandidates(advisoryProfile)
    advisoryContext = buildAdvisoryContext(advisoryCandidates)
  }

  const systemPrompt = [system, advisoryContext].filter(Boolean).join('\n\n')
  const anthropicMessages = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: String(m.content || '') }))
  const modelsToTry = Array.from(new Set([
    ANTHROPIC_MODEL,
    ...ANTHROPIC_MODEL_CANDIDATES,
    ...DEFAULT_MODEL_CANDIDATES,
  ].filter(Boolean)))

  try {
    if (!modelsToTry.length) {
      return res.status(500).json({ error: { message: 'Define ANTHROPIC_MODEL en el servidor' } })
    }

    let response
    modelLoop: for (const model of modelsToTry) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        response = await fetch('https://api.anthropic.com/v1/messages', {
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
            max_tokens: 8192,
            temperature: 0.3,
            stream: !!stream,
          }),
        })
        if ((response.status === 429 || response.status === 503) && attempt < 3) {
          await new Promise(r => setTimeout(r, attempt * 5000))
          continue
        }
        if (response.status === 404) {
          const rawError = await response.text()
          let parsed = null
          try { parsed = JSON.parse(rawError) } catch {}
          const errType = parsed?.error?.type || ''
          const errMsg = parsed?.error?.message || ''
          if (errType === 'not_found_error' || String(errMsg).toLowerCase().includes('model:')) {
            break
          }
          return res.status(404).json({
            error: { message: errMsg || rawError || 'Error de Anthropic' },
          })
        }
        break modelLoop
      }
      response = undefined
    }

    if (!response) {
      return res.status(404).json({
        error: { message: `No se encontró un modelo válido. Probados: ${modelsToTry.join(', ')}` },
      })
    }

    if (!response.ok) {
      const rawError = await response.text()
      let parsedError = null
      try { parsedError = JSON.parse(rawError) } catch {}
      console.error('Anthropic error:', rawError)
      return res.status(response.status).json({
        error: { message: parsedError?.error?.message || rawError || 'Error de Anthropic' },
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
    res.status(500).json({ error: { message: 'Error interno del servidor' } })
  }
}
