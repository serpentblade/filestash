export type ApiErrorCode = 'FORBIDDEN' | 'NOT_ALLOWED' | 'SERVER' | 'NETWORK' | 'OTHER'

export class ApiError extends Error {
  code: ApiErrorCode
  status: number
  constructor(code: ApiErrorCode, message: string, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export function apiUrl(path: string): string {
  if (path.startsWith('/')) throw new Error(`apiUrl: path must be relative, got "${path}"`)
  return new URL(path, document.baseURI).toString()
}

type Method = 'GET' | 'POST' | 'DELETE'

/** Performs the fetch and returns the Response; throws ApiError for transport and HTTP-level failures. */
export async function send(method: Method, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'X-Requested-With': 'XmlHttpRequest' }
  const init: RequestInit = { method, headers, credentials: 'same-origin' }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  let res: Response
  try {
    res = await fetch(apiUrl(path), init)
  } catch (e) {
    throw new ApiError('NETWORK', e instanceof Error ? e.message : 'Network error')
  }
  if (res.ok) return res
  const message = await errorMessage(res)
  if (res.status === 401 || res.status === 403) throw new ApiError('FORBIDDEN', message, res.status)
  if (message === 'Not Allowed') throw new ApiError('NOT_ALLOWED', message, res.status)
  if (res.status >= 500) throw new ApiError('SERVER', message, res.status)
  throw new ApiError('OTHER', message, res.status)
}

async function errorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  try {
    const j = JSON.parse(text)
    if (j && typeof j.message === 'string') return j.message
  } catch { /* not JSON */ }
  return text || res.statusText || `HTTP ${res.status}`
}

export async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  opts: { text?: boolean } = {},
): Promise<T> {
  const res = await send(method, path, body)
  if (opts.text) return (await res.text()) as T
  const text = await res.text()
  let json: { status?: string; result?: T; message?: string }
  try {
    json = JSON.parse(text)
  } catch {
    throw new ApiError('OTHER', 'Invalid response', res.status)
  }
  if (json.status === 'ok') return json.result as T
  const message = json.message ?? 'Unknown error'
  throw new ApiError(message === 'Not Allowed' ? 'NOT_ALLOWED' : 'OTHER', message, res.status)
}
