export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } })
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: { message: 'API key no configurada' } })
  }

  const { system, messages, stream } = req.body

  const geminiMessages = [
    { role: 'system', content: system },
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

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '))
        for (const line of lines) {
          const data = line.replace('data: ', '')
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
