// src/hooks/useClaude.js
export async function callClaude({
  system,
  messages,
  onChunk,
  advisoryProfile,
  advisoryCandidatesFromClient,
  skipAdvisoryContext,
}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120000)

  let response
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        system,
        messages,
        stream: !!onChunk,
        advisoryProfile,
        ...(Array.isArray(advisoryCandidatesFromClient)
          ? { advisoryCandidatesFromClient }
          : {}),
        ...(skipAdvisoryContext ? { skipAdvisoryContext: true } : {}),
      }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      throw new Error('La solicitud tardó demasiado. Por favor, intenta de nuevo.')
    }
    throw new Error('No se pudo conectar con el servidor. Verifica tu conexión a internet.')
  }

  clearTimeout(timeoutId)

  if (!response.ok) {
    let errorMessage = 'Error al conectar con el servidor'
    try {
      const err = await response.json()
      if (response.status === 429) {
        errorMessage = 'El servidor está ocupado, intenta de nuevo en unos momentos.'
      } else if (response.status === 401 || response.status === 403) {
        errorMessage = 'No tienes autorización para realizar esta acción.'
      } else if (response.status >= 500) {
        errorMessage = 'El servidor tiene problemas. Por favor, intenta más tarde.'
      } else if (err.error?.message) {
        errorMessage = err.error.message
      }
    } catch {
      // Could not parse error body, use default message
    }
    throw new Error(errorMessage)
  }

  if (onChunk) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullText = ''
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
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            const text = parsed.text || ''
            if (text) {
              fullText += text
              onChunk(text)
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
          const text = parsed.text || ''
          if (text) {
            fullText += text
            onChunk(text)
          }
        } catch {}
      }
    }
    return fullText
  } else {
    const data = await response.json()
    return data.text
  }
}
