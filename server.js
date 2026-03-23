import { readFileSync } from 'fs'
import express from 'express'

// Load .env file
try {
  const env = readFileSync('.env', 'utf-8')
  for (const line of env.split('\n')) {
    const [key, ...val] = line.split('=')
    if (key && val.length) process.env[key.trim()] = val.join('=').trim()
  }
} catch {}

const app = express()
app.use(express.json())

const GROQ_API_KEY = process.env.GROQ_API_KEY

if (!GROQ_API_KEY) {
  console.error('❌ Falta GROQ_API_KEY en .env')
  process.exit(1)
}

const MAX_RETRIES = 3

async function callGroq(groqMessages, stream, maxTokens = 4096) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: groqMessages,
        max_tokens: maxTokens,
        temperature: 0.6,
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
  const { system, messages, stream } = req.body

  const groqMessages = [
    { role: 'system', content: system },
    ...messages,
  ]

  try {
    const response = await callGroq(groqMessages, !!stream)

    if (!response.ok) {
      const err = await response.json()
      console.error('Groq error:', JSON.stringify(err))
      return res.status(response.status).json({ error: { message: err.error?.message || 'Error de Groq' } })
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
    res.status(500).json({ error: { message: 'Error interno del proxy' } })
  }
})

app.listen(3001, () => {
  console.log('🔌 Proxy Groq corriendo en http://localhost:3001')
})
