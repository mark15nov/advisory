import { verifySupabaseJwt, getBearerTokenFromRequest } from '../src/lib/verifySupabaseJwt.js'

export const config = {
  api: {
    bodyParser: false,
  },
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } })
  }

  const token = getBearerTokenFromRequest(req)
  const { user } = await verifySupabaseJwt(
    token,
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
  if (!user) {
    return res.status(401).json({ error: { message: 'Sesión requerida o inválida' } })
  }

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

    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: form,
    })

    if (!r.ok) {
      const txt = await r.text()
      return res.status(r.status).json({ error: { message: txt || 'Error al transcribir audio.' } })
    }

    const data = await r.json()
    return res.status(200).json({ text: String(data?.text || '').trim() })
  } catch (err) {
    console.error('transcribe:', err)
    return res.status(500).json({ error: { message: 'Error interno en transcripción.' } })
  }
}
