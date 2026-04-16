import { readFileSync } from 'fs'
import express from 'express'
import {
  handleAdvisoryRecommendations,
  handleChat,
  handleTranscribe,
} from './src/server/backendHandlers.js'

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
app.post('/api/advisory-recommendations', handleAdvisoryRecommendations)
app.post('/api/chat', handleChat)
app.post('/api/transcribe', handleTranscribe)

app.listen(3001, () => {
  console.log('🔌 Proxy Anthropic corriendo en http://localhost:3001')
})
