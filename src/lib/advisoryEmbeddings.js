// Comparación semántica caso ↔ filas de `advisory` vía OpenAI Embeddings.
// Requiere OPENAI_API_KEY en el servidor; si falla la API, el caller usa la heurística por tokens.

import { buildExecutionContextFromPlan } from './advisoryPick.js'

const EMBED_BATCH = 100
const MAX_QUERY_CHARS = 12000
const MAX_ADVISOR_DOC_CHARS = 8000
const DEFAULT_MODEL = 'text-embedding-3-small'

function truncate(s, max) {
  const t = String(s || '').trim()
  return t.length > max ? t.slice(0, max) : t
}

function buildSemanticQueryText(profile, fullPlanText) {
  const parts = [
    profile.company && `Empresa: ${profile.company}`,
    profile.industry && `Industria: ${profile.industry}`,
    profile.role && `Rol: ${profile.role}`,
    profile.location && `Ubicación: ${profile.location}`,
    profile.caseText && `Caso / problema: ${profile.caseText}`,
    profile.whatYouDo && `Qué hace el negocio: ${profile.whatYouDo}`,
    profile.differentiation && `Diferenciación: ${profile.differentiation}`,
  ].filter(Boolean)

  const exec = buildExecutionContextFromPlan(fullPlanText)
  if (exec) {
    parts.push(`Contexto del plan, hoja de ruta e impacto a considerar:\n${exec}`)
  }

  return truncate(parts.join('\n\n'), MAX_QUERY_CHARS) || 'advisory case'
}

function buildAdvisorDocumentText(row) {
  const ind = Array.isArray(row.industrias) ? row.industrias.join(', ') : ''
  const esp = Array.isArray(row.especialidades) ? row.especialidades.join(', ') : ''
  const etapas = Array.isArray(row.etapas) ? row.etapas.join(', ') : (row.etapas ? String(row.etapas) : '')
  const parts = [
    row.nombre && `Nombre: ${row.nombre}`,
    row.empresa && `Empresa: ${row.empresa}`,
    ind && `Industrias: ${ind}`,
    esp && `Especialidades: ${esp}`,
    etapas && `Etapas: ${etapas}`,
    row.ubicacion && `Ubicación: ${row.ubicacion}`,
    row.bio && `Bio: ${row.bio}`,
    row.productos_servicios && `Productos o servicios: ${row.productos_servicios}`,
  ].filter(Boolean)
  return truncate(parts.join('\n'), MAX_ADVISOR_DOC_CHARS) || 'advisor'
}

function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const d = Math.sqrt(na) * Math.sqrt(nb)
  return d === 0 ? 0 : dot / d
}

async function fetchEmbeddingsBatch(apiKey, model, inputs) {
  if (inputs.length === 0) return []
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: inputs }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`OpenAI embeddings ${res.status}: ${t.slice(0, 500)}`)
  }
  const data = await res.json()
  return data.data
    .slice()
    .sort((x, y) => x.index - y.index)
    .map((d) => d.embedding)
}

function semanticBandLabel(sim) {
  if (sim >= 0.82) return 'muy alta'
  if (sim >= 0.72) return 'alta'
  if (sim >= 0.62) return 'media'
  return 'moderada'
}

function buildSemanticFitSummary(sim, row) {
  const parts = []
  const pct = (sim * 100).toFixed(0)
  parts.push(
    `Comparación semántica del caso con este perfil (OpenAI embeddings): afinidad ${semanticBandLabel(sim)} (similitud coseno aprox. ${pct}%).`,
  )
  const rating = Number(row.score || 0)
  if (Number.isFinite(rating) && rating > 0) {
    parts.push(`Valoración en directorio: ${rating}.`)
  }
  const exp = Number(row.experiencia_anios || 0)
  if (Number.isFinite(exp) && exp >= 5) {
    parts.push(`Experiencia declarada: ${exp} años.`)
  }
  return parts.join(' ')
}

/**
 * Ordena filas `advisory` por similitud coseno entre el embedding del caso (y plan si aplica)
 * y el embedding del texto agregado de cada fila. Mantiene el mismo criterio de `rating`/`experiencia` que el scoring heurístico.
 *
 * @param {object[]} rows
 * @param {object} profile
 * @param {{ fullPlanText?: string, apiKey: string, model?: string }} options
 */
export async function scoreAdvisoryRowsSemantic(rows, profile, options) {
  if (!Array.isArray(rows) || !profile) return []
  const { fullPlanText = '', apiKey, model = DEFAULT_MODEL } = options || {}
  if (!apiKey) return []

  if (rows.length === 0) return []

  const queryText = buildSemanticQueryText(profile, fullPlanText)
  const advisorDocs = rows.map((r) => buildAdvisorDocumentText(r))

  const [queryVec] = await fetchEmbeddingsBatch(apiKey, model, [queryText])
  if (!queryVec) throw new Error('embedding vacío para la consulta del caso')

  const advisorVecs = []
  for (let i = 0; i < advisorDocs.length; i += EMBED_BATCH) {
    const batch = advisorDocs.slice(i, i + EMBED_BATCH)
    const vecs = await fetchEmbeddingsBatch(apiKey, model, batch)
    advisorVecs.push(...vecs)
  }

  if (advisorVecs.length !== rows.length) {
    throw new Error('conteo de embeddings no coincide con filas de advisory')
  }

  const scored = rows.map((row, i) => {
    const sim = Math.max(0, Math.min(1, cosineSimilarity(queryVec, advisorVecs[i])))
    const ratingBoost = Math.min(Number(row.score || 0), 10) * 0.25
    const experienceBoost = Math.min(Number(row.experiencia_anios || 0), 30) * 0.05
    const fitScore = sim * 100 + ratingBoost + experienceBoost
    const fitSummary = buildSemanticFitSummary(sim, row)
    return {
      ...row,
      fitScore,
      fitSummary,
    }
  })

  return scored.sort((a, b) => b.fitScore - a.fitScore)
}
