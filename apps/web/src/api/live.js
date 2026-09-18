// A real bicho over HTTP.
//
// The base URL defaults to the Vercel rewrite (/api -> the tunnel, see
// deploy/README.md §4b), which is same-origin: no CORS, and it works from a
// preview deployment, whose per-branch hostname could never be in the
// server's BICHO_CORS_ORIGINS list. In dev it points at the local bicho, which
// does cross origins and is exactly what BICHO_CORS_ORIGINS allows.
import { ApiError } from './error'

const BASE =
  import.meta.env.VITE_BICHO_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:8777/v1' : '/api')

async function call(path, { method = 'GET', body } = {}) {
  let response
  try {
    response = await fetch(BASE + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('offline', 'No consigo hablar con el bicho.', 0)
  }

  const payload = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload?.error
    throw new ApiError(
      error?.code || 'upstream_failed',
      error?.message || 'Algo ha fallado hablando con el bicho.',
      response.status,
    )
  }
  return payload
}

export const health = () => call('/health')
export const learned = () => call('/learned')
export const progress = () => call('/study/progress')
export const study = (title, text) => call('/study', { method: 'POST', body: { title, text } })
export const ask = (q) => call('/ask', { method: 'POST', body: { q } })
