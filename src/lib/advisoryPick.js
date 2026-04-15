// Lógica compartida: Supabase advisory → score → top 1..3 para el modelo

export const ADVISORY_PICK_MIN = 1
export const ADVISORY_PICK_MAX = 3

function tokenizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function matchedItemsFromStringArray(arr, profileTokens, tokenize) {
  if (!Array.isArray(arr)) return []
  const seen = new Set()
  const out = []
  for (const item of arr) {
    if (item == null) continue
    const key = String(item).trim()
    if (!key || seen.has(key)) continue
    const toks = tokenize(key)
    if (toks.some((t) => profileTokens.has(t))) {
      seen.add(key)
      out.push(key)
    }
  }
  return out
}

/**
 * Texto legible derivado de la misma heurística que fitScore (sin inventar datos).
 */
function buildFitSummary({
  row,
  industryScore,
  specialtyScore,
  locationScore,
  catalogScore,
  industryMatched,
  specialtyMatched,
}) {
  const parts = []
  if (industryMatched.length > 0) {
    const shown = industryMatched.slice(0, 5)
    const extra = industryMatched.length > 5 ? ' (y más)' : ''
    parts.push(`Industrias del perfil que conectan con tu caso: ${shown.join(', ')}${extra}.`)
  } else if (industryScore > 0) {
    parts.push('Hay coincidencias de términos entre tu caso y las industrias registradas del advisor.')
  }
  if (specialtyMatched.length > 0) {
    const shown = specialtyMatched.slice(0, 5)
    const extra = specialtyMatched.length > 5 ? ' (y más)' : ''
    parts.push(`Especialidades relevantes: ${shown.join(', ')}${extra}.`)
  } else if (specialtyScore > 0) {
    parts.push('Hay alineación entre el caso y las especialidades declaradas en el directorio.')
  }
  if (locationScore > 0 && String(row.ubicacion || '').trim()) {
    parts.push(`Ubicación del perfil (${String(row.ubicacion).trim()}) coherente con palabras clave del caso.`)
  }
  const hasTopicFit = industryScore > 0 || specialtyScore > 0 || locationScore > 0
  if (catalogScore > 0) {
    if (!hasTopicFit) {
      parts.push('El texto del caso y la descripción, productos o empresa del advisor comparten vocabulario en el directorio.')
    } else {
      parts.push('La descripción y datos del perfil refuerzan el encaje.')
    }
  }
  const rating = Number(row.score || 0)
  if (Number.isFinite(rating) && rating > 0) {
    parts.push(`Valoración en directorio: ${rating}.`)
  }
  const exp = Number(row.experiencia_anios || 0)
  if (Number.isFinite(exp) && exp >= 5) {
    parts.push(`Experiencia declarada: ${exp} años.`)
  }
  if (parts.length === 0) {
    return 'Incluido entre los mejores puntajes del directorio para tu caso; el encaje por texto es limitado, conviene revisarlo manualmente.'
  }
  return parts.join(' ')
}

/**
 * Ordena filas advisory por ajuste al perfil del caso (heurística por tokens).
 * @param {object[]} rows - Filas de public.advisory
 * @param {object} profile - { industry, caseText, whatYouDo, differentiation, location, role }
 */
export function scoreAdvisoryRows(rows, profile) {
  if (!Array.isArray(rows) || !profile) return []
  const tokenize = tokenizeText

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

    const industryOverlap = countOverlap(industryTokens)
    const specialtyOverlap = countOverlap(specialtyTokens)
    const locationOverlap = countOverlap(locationTokens)
    const catalogOverlap = countOverlap(catalogTokens)
    const industryScore = industryOverlap * 4
    const specialtyScore = specialtyOverlap * 3
    const locationScore = locationOverlap * 2
    const catalogScore = catalogOverlap * 2
    const ratingBoost = Number(row.score || 0)
    const experienceBoost = Math.min(Number(row.experiencia_anios || 0), 30) * 0.05

    const industryMatched = matchedItemsFromStringArray(row.industrias, profileTokens, tokenize)
    const specialtyMatched = matchedItemsFromStringArray(row.especialidades, profileTokens, tokenize)
    const fitSummary = buildFitSummary({
      row,
      industryScore,
      specialtyScore,
      locationScore,
      catalogScore,
      industryMatched,
      specialtyMatched,
    })

    return {
      ...row,
      fitScore: industryScore + specialtyScore + locationScore + catalogScore + ratingBoost + experienceBoost,
      fitSummary,
    }
  })

  return scored.sort((a, b) => b.fitScore - a.fitScore)
}

function extractSection(fullText, titleRegex) {
  const text = String(fullText || '').replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  let inSection = false
  const out = []
  for (const line of lines) {
    const m = line.match(/^##\s+(.+)$/)
    if (m) {
      const heading = String(m[1] || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
      if (titleRegex.test(heading)) {
        inSection = true
        continue
      }
      if (inSection) break
    }
    if (inSection) out.push(line)
  }
  return out.join('\n').trim()
}

/**
 * Re-ranking para cuando ya existe plan generado:
 * prioriza capacidad de ejecutar/acompañar acciones del plan y hoja de ruta.
 */
export function scoreAdvisoryRowsByGeneratedPlan(rows, profile, fullPlanText) {
  if (!Array.isArray(rows) || !profile) return []
  const baseSorted = scoreAdvisoryRows(rows, profile)
  if (!String(fullPlanText || '').trim()) return baseSorted

  const planSection = extractSection(fullPlanText, /^plan de accion$/i)
  const roadmapSection = extractSection(fullPlanText, /^hoja de ruta/i)
  const impactSection = extractSection(fullPlanText, /^proyeccion de impacto$/i)
  const executionContext = [planSection, roadmapSection, impactSection]
    .filter(Boolean)
    .join('\n')
    .trim()
  if (!executionContext) return baseSorted

  const executionTokens = new Set(tokenizeText(executionContext))
  const countExecOverlap = (tokens) => {
    let n = 0
    for (const token of tokens) {
      if (executionTokens.has(token)) n += 1
    }
    return n
  }

  const rescored = baseSorted.map((row) => {
    const domainText = [
      row.productos_servicios,
      row.bio,
      row.empresa,
      ...(Array.isArray(row.especialidades) ? row.especialidades : []),
      ...(Array.isArray(row.industrias) ? row.industrias : []),
    ].filter(Boolean).join(' ')

    const domainTokens = tokenizeText(domainText)
    const overlap = countExecOverlap(domainTokens)
    const executionBoost = overlap * 4

    const oldSummary = String(row.fitSummary || '').trim()
    const executionHint = executionBoost > 0
      ? ` También comparte vocabulario con acciones de ejecución del plan y hoja de ruta (señales: ${Math.min(overlap, 12)}).`
      : ' Aporta principalmente como consejería estratégica general para el caso.'

    return {
      ...row,
      fitScore: Number(row.fitScore || 0) + executionBoost,
      fitSummary: `${oldSummary || 'Perfil con encaje general al caso.'}${executionHint}`.trim(),
    }
  })

  return rescored.sort((a, b) => b.fitScore - a.fitScore)
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
        fitSummary: str(row.fitSummary, 1200),
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
    `- SIEMPRE recomienda los ${n} candidato(s) listados abajo (máximo ${ADVISORY_PICK_MAX}). El objetivo es generar networking entre el presentador y los advisors.`,
    '- Usa solo nombres que aparezcan abajo; no inventes personas.',
    '- Ordena del mejor al peor ajuste al caso.',
    '- Busca conexiones amplias: industria, servicios complementarios, experiencia en problemas similares, capacidad de consejería, o sinergia profesional.',
    '- SIEMPRE incluye una justificación específica al caso para cada advisor. Nunca dejes a un advisor sin justificación.',
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
      c.fitSummary?.trim() && `   - Por qué encaja (directorio): ${String(c.fitSummary).trim()}`,
      `   - Especialidades: ${specialties || 'N/D'}`,
      `   - Industrias: ${industries || 'N/D'}`,
      `   - Ubicación: ${c.ubicacion || 'N/D'}`,
      `   - Experiencia: ${c.experiencia_anios || 'N/D'} años`,
      `   - Descripción: ${[c.bio, c.productos_servicios].filter(Boolean).join(' | ') || 'N/D'}`,
    ].filter(Boolean).join('\n')
  })

  return `${intro}${lines.join('\n')}`
}
