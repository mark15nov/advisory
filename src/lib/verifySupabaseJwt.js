import { createClient } from '@supabase/supabase-js'

/**
 * Valida el access_token JWT del cliente contra Supabase Auth (uso en servidor).
 */
export async function verifySupabaseJwt(accessToken, supabaseUrl, serviceRoleKey) {
  if (!accessToken || !supabaseUrl || !serviceRoleKey) {
    return { user: null, error: new Error('missing_params') }
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
  const { data: { user }, error } = await supabase.auth.getUser(accessToken)
  if (error || !user) return { user: null, error: error || new Error('invalid_token') }
  return { user, error: null }
}

export function getBearerTokenFromRequest(req) {
  const raw = req.headers?.authorization || req.headers?.Authorization
  if (!raw || typeof raw !== 'string') return null
  const m = raw.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}
