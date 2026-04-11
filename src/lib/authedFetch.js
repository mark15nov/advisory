/** Token JWT actual (lo actualiza AuthProvider al cambiar la sesión). */
let authAccessToken = null

export function setAuthAccessToken(token) {
  authAccessToken = token || null
}

export async function authedFetch(input, init = {}) {
  const headers = new Headers(init.headers)
  if (authAccessToken) {
    headers.set('Authorization', `Bearer ${authAccessToken}`)
  }
  return fetch(input, { ...init, headers })
}
