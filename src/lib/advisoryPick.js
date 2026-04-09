// Lógica compartida: Supabase advisory → score → top 1..3 para el modelo

export const ADVISORY_PICK_MIN = 1
export const ADVISORY_PICK_MAX = 3

/**
 * Ordena filas advisory por ajuste al perfil del caso (heurística por tokens).
 * @param {object[]} rows - Filas de public.advisory
 * @param {object} profile - { industry, caseText, whatYouDo, differentiation, location, role }
 */
export function scoreAdvisoryRows(rows, profile) {
  if (!Array.isArray(rows) || !profile) return []

  const tokenize = (text) => String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  const profileTokens = new Set(tokenize([
    profile.company,
    profile.industry,
    profile.caseText,
    profile.whatYouDo,
    profile.differentiation,
    profile.location,
    profile.role,
  ].filter(Boolean).join(' ')))

  function countOverlap(tokens) {
    let score = 0
    for (const token of tokens) {
      if (profileTokens.has(token)) score += 1
    }
    return score
  }

  const scored = rows.map((row) => {
    const industryTokens = tokenize((row.industrias || []).join(' '))
    const specialtyTokens = tokenize((row.especialidades || []).join(' '))
    const locationTokens = tokenize(row.ubicacion || '')
    // Texto libre del directorio (muchos registros vienen sin arrays pero con descripción en bio/productos/empresa)
    const catalogText = [row.bio, row.productos_servicios, row.empresa]
      .filter(Boolean)
      .join(' ')
    const catalogTokens = tokenize(catalogText)

    const industryScore = countOverlap(industryTokens) * 4
    const specialtyScore = countOverlap(specialtyTokens) * 3
    const locationScore = countOverlap(locationTokens) * 2
    const catalogScore = countOverlap(catalogTokens) * 2
    const ratingBoost = Number(row.score || 0)
    const experienceBoost = Math.min(Number(row.experiencia_anios || 0), 30) * 0.05

    return {
      ...row,
      fitScore: industryScore + specialtyScore + locationScore + catalogScore + ratingBoost + experienceBoost,
    }
  })

  return scored.sort((a, b) => b.fitScore - a.fitScore)
}

/**
 * Entre ADVISORY_PICK_MIN y ADVISORY_PICK_MAX opciones (si hay filas en BD).
 */
export function pickTopAdvisoryCandidates(sortedRows) {
  if (!Array.isArray(sortedRows) || sortedRows.length === 0) return []
  const n = Math.min(ADVISORY_PICK_MAX, sortedRows.length)
  return sortedRows.slice(0, n)
}

/**
 * Candidatos enviados por el cliente (misma lista que el panel de directorio).
 * Filtra y limita tamaño para el contexto del modelo; no sustituye validación de negocio.
 */
export function normalizeClientAdvisoryCandidates(arr) {
  if (!Array.isArray(arr)) return []
  const str = (v, max = 4000) => {
    if (v == null) return ''
    const s = String(v).trim()
    return s.length > max ? s.slice(0, max) : s
  }
  const stringArray = (v) => {
    if (!Array.isArray(v)) return []
    return v.map((x) => str(String(x), 200)).filter(Boolean).slice(0, 80)
  }

  return arr
    .slice(0, ADVISORY_PICK_MAX)
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const nombre = str(row.nombre, 500)
      if (!nombre) return null
      return {
        nombre,
        empresa: str(row.empresa, 500),
        web: str(row.web, 500),
        email: str(row.email, 320),
        bio: str(row.bio, 4000),
        productos_servicios: str(row.productos_servicios, 4000),
        especialidades: stringArray(row.especialidades),
        industrias: stringArray(row.industrias),
        ubicacion: str(row.ubicacion, 500),
        experiencia_anios: Number.isFinite(Number(row.experiencia_anios))
          ? Math.min(99, Math.max(0, Number(row.experiencia_anios)))
          : undefined,
        score: Number.isFinite(Number(row.score))
          ? Number(row.score)
          : (Number.isFinite(Number(row.fitScore)) ? Number(row.fitScore) : undefined),
        activo: true,
      }
    })
    .filter(Boolean)
}

export function buildAdvisoryContext(candidates) {
  if (!candidates.length) {
    return [
      'CANDIDATOS ADVISORY DESDE BASE DE DATOS:',
      '- Sin candidatos disponibles.',
      '',
      'En "## ADVISORS RECOMENDADOS" indica que no hay candidatos en la base de datos para este caso.',
    ].join('\n')
  }

  const n = candidates.length
  const intro = [
    `CANDIDATOS ADVISORY DESDE BASE DE DATOS (${n} preseleccionado${n > 1 ? 's' : ''} por ajuste al caso):`,
    `INSTRUCCIÓN OBLIGATORIA para "## ADVISORS RECOMENDADOS":`,
    `- Recomienda como mínimo ${ADVISORY_PICK_MIN} y como máximo ${n} nombre(s) de la lista siguiente (nunca más de ${ADVISORY_PICK_MAX}).`,
    '- Usa solo nombres que aparezcan abajo; no inventes personas.',
    '- Ordena del mejor al peor ajuste al caso.',
    '- Si solo uno encaja claramente, recomienda uno; si varios encajan, hasta tres en total.',
    '',
  ].join('\n')

  const lines = candidates.map((c, index) => {
    const specialties = Array.isArray(c.especialidades) ? c.especialidades.join(', ') : ''
    const industries = Array.isArray(c.industrias) ? c.industrias.join(', ') : ''
    const contact = [
      c.empresa && `Empresa: ${c.empresa}`,
      c.web && `Web: ${c.web}`,
      c.email && `Email: ${c.email}`,
    ].filter(Boolean).join(' | ')
    return [
      `${index + 1}. ${c.nombre}`,
      contact && `   - Contacto: ${contact}`,
      `   - Especialidades: ${specialties || 'N/D'}`,
      `   - Industrias: ${industries || 'N/D'}`,
      `   - Ubicación: ${c.ubicacion || 'N/D'}`,
      `   - Experiencia: ${c.experiencia_anios || 'N/D'} años`,
      `   - Descripción: ${[c.bio, c.productos_servicios].filter(Boolean).join(' | ') || 'N/D'}`,
    ].filter(Boolean).join('\n')
  })

  return `${intro}${lines.join('\n')}`
}
