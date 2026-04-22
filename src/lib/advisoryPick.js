// Lógica compartida: Supabase advisory → score → top 1..3 para el modelo

export const ADVISORY_PICK_MIN = 1
export const ADVISORY_PICK_MAX = 3
export const ADVISORY_PICK_POOL_SIZE = 12

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
    // Capped so a rating alto no aplaste a candidatos con buena afinidad textual
    const ratingBoost = Math.min(Number(row.score || 0), 10) * 0.25
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

function normalizeTag(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function collectRowSignals(row) {
  const specialties = Array.isArray(row.especialidades) ? row.especialidades : []
  const industries = Array.isArray(row.industrias) ? row.industrias : []
  const location = normalizeTag(row.ubicacion || '')

  const specialtySet = new Set(specialties.map(normalizeTag).filter(Boolean))
  const industrySet = new Set(industries.map(normalizeTag).filter(Boolean))
  const locationSet = location ? new Set([location]) : new Set()

  return {
    specialtySet,
    industrySet,
    locationSet,
    hasSignals: specialtySet.size > 0 || industrySet.size > 0 || locationSet.size > 0,
  }
}

function overlapSize(a, b) {
  if (!a.size || !b.size) return 0
  let n = 0
  for (const value of a) {
    if (b.has(value)) n += 1
  }
  return n
}

function deterministicNoise(seedText) {
  let h = 2166136261
  const s = String(seedText || '')
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 1000) / 1000
}

/**
 * Genera una semilla corta y estable a partir del perfil del caso,
 * para que la rotación varíe por presentación y no solo por día.
 */
export function buildCaseSeed(profile) {
  if (!profile) return ''
  const raw = [
    String(profile.caseText || '').slice(0, 120),
    String(profile.company || '').slice(0, 40),
    String(profile.industry || '').slice(0, 40),
    String(profile.presenter || '').slice(0, 40),
  ].join('|')
  return raw
}

/** Texto de plan + hoja de ruta + proyección para enriquecer la consulta semántica o el boost heurístico. */
export function buildExecutionContextFromPlan(fullPlanText) {
  if (!String(fullPlanText || '').trim()) return ''
  const planSection = extractSection(fullPlanText, /^plan de accion$/i)
  const roadmapSection = extractSection(fullPlanText, /^hoja de ruta/i)
  const impactSection = extractSection(fullPlanText, /^proyeccion de impacto$/i)
  return [planSection, roadmapSection, impactSection]
    .filter(Boolean)
    .join('\n')
    .trim()
}

/**
 * Suma el boost por solapamiento de tokens entre el plan generado y el perfil del advisor.
 * @param {object[]} baseRows - Filas con fitScore y fitSummary ya calculados.
 */
export function applyPlanExecutionBoost(baseRows, fullPlanText) {
  if (!Array.isArray(baseRows) || baseRows.length === 0) return []
  if (!String(fullPlanText || '').trim()) {
    return [...baseRows].sort((a, b) => b.fitScore - a.fitScore)
  }

  const executionContext = buildExecutionContextFromPlan(fullPlanText)
  if (!executionContext) {
    return [...baseRows].sort((a, b) => b.fitScore - a.fitScore)
  }

  const executionTokens = new Set(tokenizeText(executionContext))
  const countExecOverlap = (tokens) => {
    let n = 0
    for (const token of tokens) {
      if (executionTokens.has(token)) n += 1
    }
    return n
  }

  const rescored = baseRows.map((row) => {
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
 * Re-ranking para cuando ya existe plan generado:
 * prioriza capacidad de ejecutar/acompañar acciones del plan y hoja de ruta.
 */
export function scoreAdvisoryRowsByGeneratedPlan(rows, profile, fullPlanText) {
  if (!Array.isArray(rows) || !profile) return []
  const baseSorted = scoreAdvisoryRows(rows, profile)
  return applyPlanExecutionBoost(baseSorted, fullPlanText)
}

/**
 * Entre ADVISORY_PICK_MIN y ADVISORY_PICK_MAX opciones (si hay filas en BD).
 * @param {object[]} sortedRows - Filas ya ordenadas por fitScore.
 * @param {string} [caseSeed] - Semilla derivada del caso para variar la rotación por presentación.
 */
export function pickTopAdvisoryCandidates(sortedRows, caseSeed = '') {
  if (!Array.isArray(sortedRows) || sortedRows.length === 0) return []
  const n = Math.max(ADVISORY_PICK_MIN, Math.min(ADVISORY_PICK_MAX, sortedRows.length))
  const poolSize = Math.min(ADVISORY_PICK_POOL_SIZE, sortedRows.length)
  const pool = sortedRows.slice(0, poolSize)
  const todaySeed = new Date().toISOString().slice(0, 10)

  const remaining = pool.map((row, idx) => ({
    row,
    idx,
    signals: collectRowSignals(row),
    // Semilla única por caso + día + perfil de row para variedad real entre presentaciones.
    noise: deterministicNoise(`${todaySeed}:${caseSeed}:${row.id || row.nombre || idx}`),
  }))

  const picked = []
  const pickedSignalSets = []

  while (picked.length < n && remaining.length > 0) {
    let bestIdx = 0
    let bestAdjusted = Number.NEGATIVE_INFINITY

    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i]
      const baseScore = Number(candidate.row.fitScore || 0)
      let diversityPenalty = 0

      // Penaliza perfiles demasiado similares a los ya elegidos para evitar repeticiones.
      for (const prev of pickedSignalSets) {
        diversityPenalty += overlapSize(candidate.signals.specialtySet, prev.specialtySet) * 1.6
        diversityPenalty += overlapSize(candidate.signals.industrySet, prev.industrySet) * 1.4
        diversityPenalty += overlapSize(candidate.signals.locationSet, prev.locationSet) * 0.8
      }

      // Si no hay señales estructuradas, aplica ligera penalización para priorizar perfiles clasificables.
      if (!candidate.signals.hasSignals) diversityPenalty += 0.7

      // Rotación controlada por caso: suficiente para romper empates y variar entre presentaciones.
      const rotationBoost = candidate.noise * 2.8
      const adjusted = baseScore - diversityPenalty + rotationBoost

      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted
        bestIdx = i
      }
    }

    const [winner] = remaining.splice(bestIdx, 1)
    picked.push(winner.row)
    pickedSignalSets.push(winner.signals)
  }

  return picked
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

const DEFAULT_CATALOG_MAX_CHARS = 100000

function strPreview(v, max) {
  const s = String(v ?? '').trim()
  if (!s) return ''
  return s.length > max ? `${s.slice(0, max)}…` : s
}

/**
 * Línea compacta con datos reales de una fila de `advisory` (Supabase) para el prompt del modelo.
 */
function buildSingleRowCatalogLine(row) {
  const ind = Array.isArray(row.industrias)
    ? row.industrias.map((x) => strPreview(x, 80)).filter(Boolean).join('; ')
    : ''
  const esp = Array.isArray(row.especialidades)
    ? row.especialidades.map((x) => strPreview(x, 80)).filter(Boolean).join('; ')
    : ''
  return [
    `id:${row.id || '—'}`,
    `Nombre:${strPreview(row.nombre, 200)}`,
    `Empresa:${strPreview(row.empresa, 120)}`,
    `Industrias:${ind || 'N/D'}`,
    `Especialidades:${esp || 'N/D'}`,
    `Ubicación:${strPreview(row.ubicacion, 100)}`,
    `Experiencia_años:${row.experiencia_anios ?? 'N/D'}`,
    `Valoración_directorio:${row.score ?? 'N/D'}`,
    `Bio:${strPreview(row.bio, 320)}`,
    `Productos_o_servicios:${strPreview(row.productos_servicios, 320)}`,
  ].join(' | ')
}

/**
 * Catálogo completo (hasta límite de caracteres) para que el modelo lea y elija 1..N advisors reales.
 * @param {object} options
 * @param {number} [options.maxTotalChars=100000]
 */
export function buildFullAdvisoryDatabaseContext(rows, options = {}) {
  const maxTotalChars = Number.isFinite(options.maxTotalChars) && options.maxTotalChars > 8000
    ? options.maxTotalChars
    : DEFAULT_CATALOG_MAX_CHARS
  if (!Array.isArray(rows) || !rows.length) {
    return [
      'DIRECTORIO ADVISORY (public.advisory, Supabase):',
      '- Sin filas o sin acceso al directorio.',
      '',
      'En "## ADVISORS RECOMENDADOS" indica que no hay candidatos en la base de datos para este caso.',
    ].join('\n')
  }
  const totalInDb = rows.length
  const intro = [
    'DIRECTORIO ADVISORY (public.advisory, Supabase):',
    'A continuación hay perfiles reales (extraídos de la base de datos en el servidor, no inventados). El conteo exacto figura al final de este bloque.',
    `INSTRUCCIÓN OBLIGATORIA para "## ADVISORS RECOMENDADOS":`,
    `- Tú debes LEER el catálogo, COMPARAR con el caso, el plan de 90 días y la hoja de ruta, y ELEGIR de forma razonada entre **${ADVISORY_PICK_MIN}** y **${ADVISORY_PICK_MAX}** personas cuyo nombre (campo "Nombre:…") aparezca en una de las líneas de abajo.`,
    '- Cada recomendada/o debe ser ELEGIDA por ti SOLO a partir de este listado. No inventes nombres de personas, empresas del directorio ni perfiles ajenos a lo que se muestra en las líneas.',
    '- Si el listado se trunca por límite de contexto, sigue pudiendo elegir solo entre las líneas que alcanzaste a leer; nunca alucines perfiles faltantes.',
    '- Incluye justificación concreta al caso (cómo ayuda, qué acción o resultado).',
    '',
  ]
  const headerText = intro.join('\n')
  const lines = []
  let used = headerText.length + 1
  for (const row of rows) {
    const line = `- ${buildSingleRowCatalogLine(row)}`
    if (used + line.length + 1 > maxTotalChars) break
    lines.push(line)
    used += line.length + 1
  }
  const shown = lines.length
  const footer = []
  if (shown < totalInDb) {
    footer.push(
      ``,
      `(Se incluyeron ${shown} de ${totalInDb} perfiles según límite de contexto. Todos provienen de public.advisory.)`,
    )
  } else {
    footer.push(``, `Fin del directorio: ${shown} perfiles.`)
  }
  return `${headerText}\n${lines.join('\n')}\n${footer.join('\n')}`
}

export function normAdvisorNameKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\*\*/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Sección "ADVISORS RECOMENDADOS" extraída del informe (markdown).
 */
export function extractAdvisorsSectionFromReport(fullText) {
  if (!fullText) return ''
  const lines = String(fullText).replace(/\r\n/g, '\n').split('\n')
  const normHeading = (s) => String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const isAdvisorsHeading = (h) => {
    const n = normHeading(h)
    return (
      n === 'advisors recomendados' ||
      n === 'advisor recomendados' ||
      n === 'advisores recomendados' ||
      n.startsWith('advisors recomendados ') ||
      n.startsWith('advisores recomendados ')
    )
  }
  let inSection = false
  const sectionLines = []
  for (const line of lines) {
    const m = line.match(/^#{1,6}\s+(.+)$/)
    if (m) {
      if (isAdvisorsHeading(m[1])) {
        inSection = true
        continue
      } else if (inSection) {
        break
      }
    }
    if (inSection) sectionLines.push(line)
  }
  const out = sectionLines.join('\n').trim()
  if (out) return out

  // Fallback: si no hay heading markdown, intenta desde texto plano con el título.
  const whole = String(fullText).replace(/\r\n/g, '\n')
  const headingRegex = /(advisors?\s+recomendados|advisores\s+recomendados)\s*:?/i
  const startMatch = whole.match(headingRegex)
  if (!startMatch || startMatch.index == null) return ''
  const after = whole.slice(startMatch.index + startMatch[0].length)
  const cutAt = after.search(/\n\s*#{1,6}\s+/)
  return (cutAt >= 0 ? after.slice(0, cutAt) : after).trim()
}

/**
 * Líneas numeradas 1. Nombre - Ajuste: … del cuerpo de la sección advisors.
 */
export function parseNumberedAdvisorNamesFromAdvisorsSection(content) {
  if (!String(content || '').trim()) return []
  const lines = String(content).replace(/\r\n/g, '\n').split('\n')
  const names = []
  const seen = new Set()
  const pushName = (rawName) => {
    const cleaned = String(rawName || '')
      .replace(/\*\*/g, '')
      .replace(/^["'`]+|["'`]+$/g, '')
      .trim()
    if (!cleaned) return
    const key = normAdvisorNameKey(cleaned)
    if (!key || seen.has(key)) return
    seen.add(key)
    names.push(cleaned)
  }
  for (const line of lines) {
    const cleaned = line.replace(/\*\*/g, '').replace(/^\s+/, '')
    const m = cleaned.match(/^(?:[-*•]\s+|\d+[\.\)\-]\s+)(.+)$/)
    if (m) {
      let headerClean = m[1].replace(/\*\*/g, '').trim()
      // Trunca metadatos comunes para conservar solo el nombre.
      headerClean = headerClean
        .replace(/\s*[—–\-]\s*Ajuste.*$/i, '')
        .replace(/\s*[—–\-]\s*Especialidad.*$/i, '')
        .replace(/\s*[—–\-]\s*Justificaci[oó]n.*$/i, '')
        .replace(/\s*\(\s*Ajuste.*$/i, '')
        .trim()
      // Evita capturar metadatos como si fueran nombre.
      if (/^(ajuste|especialidad|justificaci[oó]n|empresa|web|email|bio|descripci[oó]n)\b\s*:?/i.test(headerClean)) continue
      pushName(headerClean)
    }
  }
  return names
}

/**
 * Extrae nombres de advisors cuando el modelo no usa numeración/bullets,
 * detectando líneas de nombre seguidas por metadatos (Ajuste/Especialidad/Justificación).
 */
export function parsePlainAdvisorNamesFromAdvisorsSection(content) {
  if (!String(content || '').trim()) return []
  const lines = String(content).replace(/\r\n/g, '\n').split('\n')
  const names = []
  const seen = new Set()
  const metaRx = /^(ajuste|especialidad|justificaci[oó]n)\b\s*:/i
  const rejectRx = /^(ajuste|especialidad|justificaci[oó]n|empresa|web|email|bio|descripci[oó]n)\b/i

  const pushName = (raw) => {
    const cleaned = String(raw || '')
      .replace(/\*\*/g, '')
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^\d+[\.\)\-]\s+/, '')
      .trim()
    if (!cleaned) return
    if (rejectRx.test(cleaned)) return
    const key = normAdvisorNameKey(cleaned)
    if (!key || seen.has(key)) return
    seen.add(key)
    names.push(cleaned)
  }

  for (let i = 0; i < lines.length; i += 1) {
    const curr = String(lines[i] || '').trim()
    if (!curr) continue
    // Candidata: línea de nombre (sin encabezado markdown, sin bullets evidentes)
    if (/^#{1,6}\s+/.test(curr)) continue
    if (/^\s*(?:[-*•]\s+|\d+[\.\)\-]\s+)/.test(curr)) continue
    if (rejectRx.test(curr)) continue

    const next1 = String(lines[i + 1] || '').trim()
    const next2 = String(lines[i + 2] || '').trim()
    // Señal de bloque advisor: metadato en próximas líneas.
    if (metaRx.test(next1) || metaRx.test(next2)) {
      pushName(curr)
    }
  }

  return names
}

/**
 * Alinea filas de `advisory` con los nombres en el orden devuelto por el informe.
 */
export function matchAdvisoryRowsByNames(rows, wantedNames) {
  if (!Array.isArray(rows) || !Array.isArray(wantedNames) || !wantedNames.length) return []
  const out = []
  const used = new Set()
  const tokenSet = (s) => {
    const norm = normAdvisorNameKey(s)
    return new Set(norm.split(' ').map((t) => t.trim()).filter((t) => t.length >= 3))
  }
  const overlapCount = (a, b) => {
    let n = 0
    for (const t of a) {
      if (b.has(t)) n += 1
    }
    return n
  }
  for (const wanted of wantedNames) {
    const nw = normAdvisorNameKey(wanted)
    if (nw.length < 2) continue
    let found = null
    for (const r of rows) {
      if (r?.id != null && used.has(r.id)) continue
      const rn = normAdvisorNameKey(r.nombre)
      if (rn && rn === nw) {
        found = r
        break
      }
    }
    if (!found) {
      const wantedTokens = tokenSet(wanted)
      let best = null
      let bestScore = 0
      for (const r of rows) {
        if (r?.id != null && used.has(r.id)) continue
        const rn = normAdvisorNameKey(r.nombre)
        if (!rn) continue
        if (rn.includes(nw) || nw.includes(rn)) {
          found = r
          break
        }
        const score = overlapCount(wantedTokens, tokenSet(r.nombre))
        if (score > bestScore) {
          bestScore = score
          best = r
        }
      }
      if (!found && best && bestScore >= 1) found = best
    }
    if (found) {
      if (found.id != null) used.add(found.id)
      out.push(found)
    }
  }
  return out
}

/**
 * Variante estricta: intenta match exacto primero, luego fuzzy como fallback.
 * Asegura que cuando Claude menciona nombres, se retornen los mejores matches disponibles.
 */
export function matchAdvisoryRowsByNamesStrict(rows, wantedNames) {
  if (!Array.isArray(rows) || !Array.isArray(wantedNames) || !wantedNames.length) return []
  const out = []
  const used = new Set()
  const tokenSet = (s) => {
    const norm = normAdvisorNameKey(s)
    return new Set(norm.split(' ').map((t) => t.trim()).filter((t) => t.length >= 3))
  }
  const overlapCount = (a, b) => {
    let n = 0
    for (const t of a) {
      if (b.has(t)) n += 1
    }
    return n
  }
  for (const wanted of wantedNames) {
    const nw = normAdvisorNameKey(wanted)
    if (!nw) continue
    let found = null
    for (const r of rows) {
      if (r?.id != null && used.has(r.id)) continue
      const rn = normAdvisorNameKey(r?.nombre)
      if (rn && rn === nw) {
        found = r
        break
      }
    }
    if (!found) {
      const wantedTokens = tokenSet(wanted)
      let best = null
      let bestScore = 0
      for (const r of rows) {
        if (r?.id != null && used.has(r.id)) continue
        const rn = normAdvisorNameKey(r?.nombre)
        if (!rn) continue
        if (rn.includes(nw) || nw.includes(rn)) {
          found = r
          break
        }
        const score = overlapCount(wantedTokens, tokenSet(r?.nombre))
        if (score > bestScore) {
          bestScore = score
          best = r
        }
      }
      if (!found && best && bestScore >= 1) found = best
    }
    if (found) {
      if (found.id != null) used.add(found.id)
      out.push(found)
    }
  }
  return out
}
