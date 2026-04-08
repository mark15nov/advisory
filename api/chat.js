import {
  scoreAdvisoryRows,
  pickTopAdvisoryCandidates,
  buildAdvisoryContext,
} from '../src/lib/advisoryPick.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } })
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: { message: 'API key no configurada' } })
  }

  const { system, messages, stream, advisoryProfile } = req.body

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

  const advisoryCandidates = await fetchAdvisoryCandidates(advisoryProfile)
  const advisoryContext = buildAdvisoryContext(advisoryCandidates)

  const geminiMessages = [
    { role: 'system', content: system },
    { role: 'system', content: advisoryContext },
    ...messages,
  ]

  try {
    let response
    for (let attempt = 1; attempt <= 3; attempt++) {
      response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GEMINI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gemini-2.5-flash',
          messages: geminiMessages,
          max_tokens: 8192,
          temperature: 0.3,
          stream: !!stream,
        }),
      })
      if (response.status === 429 && attempt < 3) {
        await new Promise(r => setTimeout(r, attempt * 5000))
        continue
      }
      break
    }

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
    res.status(500).json({ error: { message: 'Error interno del servidor' } })
  }
}
