# Advisory Business Boards — AI System

Sistema de foros de consejo empresarial con IA.

## Setup

1. Instala dependencias:
```bash
npm install
```

2. Configura tu API key de Anthropic en un proxy o directamente.

### Variables de entorno requeridas

Para esta versión, define en `.env`:

- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

> ⚠️ **IMPORTANTE**: Esta app llama a `api.anthropic.com` desde el navegador.
> Para producción, crea un backend proxy que maneje la API key de forma segura.
> Para desarrollo local, puedes usar una extensión de Chrome que inyecte el header,
> o configurar un proxy simple con Express.

### Proxy simple (recomendado para desarrollo)

Crea un archivo `server.js`:
```javascript
import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json())

app.post('/api/messages', async (req, res) => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(req.body),
  })
  const data = await response.json()
  res.json(data)
})

app.listen(3001, () => console.log('Proxy en http://localhost:3001'))
```

Luego actualiza `src/hooks/useClaude.js` para apuntar a `http://localhost:3001/api/messages`.

3. Corre el dev server:
```bash
npm run dev
```

## Flujo del sistema

1. **Caso** — El facilitador captura el nombre del presentador y la descripción del caso
2. **Diagnóstico** — La IA hace preguntas estratégicas (5-6 rondas), el facilitador captura las respuestas
3. **Consejo** — El facilitador registra la opinión de cada consejero del foro
4. **Plan** — La IA sintetiza todo y genera un plan de acción ejecutivo completo

## Stack
- React 18 + Vite
- Anthropic Claude API (claude-sonnet-4)
- Sin backend requerido (modo desarrollo)
