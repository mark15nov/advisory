import {
  scoreAdvisoryRows,
  pickTopAdvisoryCandidates,
} from '../src/lib/advisoryPick.js'

async function fetchRowsAndPick(profile) {
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } })
  }

  const profile = req.body
  if (!profile || typeof profile !== 'object') {
    return res.status(400).json({ error: { message: 'Body inválido' } })
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: { message: 'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el servidor' } })
  }

  try {
    const candidates = await fetchRowsAndPick(profile)
    const sanitized = candidates.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      empresa: c.empresa,
      web: c.web,
      email: c.email,
      bio: c.bio,
      productos_servicios: c.productos_servicios,
      especialidades: c.especialidades,
      industrias: c.industrias,
      ubicacion: c.ubicacion,
      fitScore: c.fitScore,
    }))
    return res.status(200).json({ candidates: sanitized })
  } catch (err) {
    console.error('advisory-recommendations:', err)
    return res.status(500).json({ error: { message: 'Error al consultar recomendaciones' } })
  }
}
