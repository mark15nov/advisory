import { supabaseBrowser } from './supabaseBrowser'

const HISTORY_KEY = 'advisory-history'

export function loadLocalHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function clearLocalHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY)
  } catch {
    /* ignore */
  }
}

function rowToEntry(row) {
  const p = row.payload
  if (p && typeof p === 'object') {
    return { ...p, id: p.id ?? row.client_session_id }
  }
  return null
}

/**
 * Lista sesiones del usuario, más recientes primero.
 * @param {string} userId
 * @returns {Promise<{ data: object[] | null, error: Error | null }>}
 */
export async function fetchAdvisorySessions(userId) {
  if (!supabaseBrowser || !userId) {
    return { data: loadLocalHistory(), error: null }
  }
  const { data, error } = await supabaseBrowser
    .from('advisory_sessions')
    .select('client_session_id, payload, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) {
    return { data: null, error }
  }
  const entries = (data || [])
    .map(rowToEntry)
    .filter(Boolean)
  return { data: entries, error: null }
}

/**
 * @param {string} userId
 * @param {object} entry — mismo shape que guarda App.saveCurrentSession
 */
export async function upsertAdvisorySession(userId, entry) {
  if (!entry?.id || !userId) return { error: new Error('missing id or user') }
  if (!supabaseBrowser) {
    const history = loadLocalHistory().filter((h) => h.id !== entry.id)
    history.unshift(entry)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
    return { error: null }
  }
  const { error } = await supabaseBrowser.from('advisory_sessions').upsert(
    {
      user_id: userId,
      client_session_id: String(entry.id),
      payload: entry,
    },
    { onConflict: 'user_id,client_session_id' },
  )
  return { error: error ?? null }
}

/**
 * @param {string} userId
 * @param {string} clientSessionId
 */
export async function deleteAdvisorySession(userId, clientSessionId) {
  if (!clientSessionId) return { error: new Error('missing id') }
  if (!supabaseBrowser || !userId) {
    const history = loadLocalHistory().filter((h) => h.id !== clientSessionId)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
    return { error: null }
  }
  const { error } = await supabaseBrowser
    .from('advisory_sessions')
    .delete()
    .eq('user_id', userId)
    .eq('client_session_id', String(clientSessionId))
  return { error: error ?? null }
}

/**
 * Si no hay filas en Supabase pero sí historial local, sube las entradas y limpia local.
 */
export async function migrateLocalHistoryToSupabase(userId) {
  if (!supabaseBrowser || !userId) return { error: null }
  const { data: rows, error: countErr } = await supabaseBrowser
    .from('advisory_sessions')
    .select('id')
    .eq('user_id', userId)
    .limit(1)

  if (countErr) return { error: countErr }
  if (rows && rows.length > 0) return { error: null }

  const local = loadLocalHistory()
  if (local.length === 0) return { error: null }

  for (const entry of local) {
    const { error } = await upsertAdvisorySession(userId, entry)
    if (error) return { error }
  }
  clearLocalHistory()
  return { error: null }
}
