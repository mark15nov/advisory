# Advisory Business Boards — AI System

Sistema de foros de consejo empresarial con IA.

## Setup

1. Instala dependencias:
```bash
npm install
```

2. Configura tu API key de Anthropic en un proxy o directamente.

### Variables de entorno requeridas

Para esta versión, define en `.env` o `.env.local`:

- `GEMINI_API_KEY` (o `ANTHROPIC_API_KEY` según uses)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL` — misma URL que `SUPABASE_URL` (visible al navegador para Auth)
- `VITE_SUPABASE_ANON_KEY` — clave **anon public** del proyecto (Project Settings → API en Supabase; **no** uses la service role en el cliente)

### Autenticación y usuarios permitidos

1. En [Supabase](https://supabase.com/dashboard) abre tu proyecto → **Authentication** → **Users**.
2. Crea cada cuenta con **Add user** (correo + contraseña) o **Invite user**. No hace falta pantalla de registro en la app: solo existen los usuarios que crees ahí.
3. En **Authentication** → **Providers** → **Email**, desactiva el registro público si quieres que nadie pueda auto-registrarse (según la versión del panel: deshabilitar “Sign ups” / confirmar solo invitaciones o usuarios creados por admin).
4. Tras cambiar variables `VITE_*`, reinicia `npm run dev` para que Vite las cargue.

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
