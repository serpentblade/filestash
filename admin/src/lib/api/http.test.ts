import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiUrl, request } from './http'

function stub(body: string, status = 200) {
  const f = vi.fn(async () => new Response(body, { status }))
  vi.stubGlobal('fetch', f)
  return f
}

beforeEach(() => {
  document.head.innerHTML = '<base href="http://h/files/">'
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.head.innerHTML = ''
})

describe('apiUrl', () => {
  it('resolves under a sub-path base', () => {
    expect(apiUrl('admin/api/config')).toBe('http://h/files/admin/api/config')
  })
  it('rejects absolute paths', () => {
    expect(() => apiUrl('/admin/api/config')).toThrow()
  })
})

describe('request', () => {
  it('sends the XHR header and unwraps result', async () => {
    const f = stub('{"status":"ok","result":{"a":1}}')
    expect(await request('GET', 'admin/api/config')).toEqual({ a: 1 })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://h/files/admin/api/config')
    expect(new Headers(init.headers).get('X-Requested-With')).toBe('XmlHttpRequest')
    expect(init.credentials).toBe('same-origin')
  })
  it('sends JSON bodies', async () => {
    const f = stub('{"status":"ok"}')
    await request('POST', 'admin/api/session', { password: 'x' })
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(init.body).toBe('{"password":"x"}')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
  })
  it('maps 403 to FORBIDDEN', async () => {
    stub('{"status":"error","message":"Permission Denied"}', 403)
    await expect(request('GET', 'admin/api/config')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'FORBIDDEN',
      status: 403,
    })
    stub('{"status":"error","message":"x"}', 401)
    await expect(request('GET', 'a')).rejects.toBeInstanceOf(ApiError)
  })
  it('maps Not Allowed to NOT_ALLOWED', async () => {
    stub('{"status":"error","message":"Not Allowed"}', 200)
    await expect(request('GET', 'a')).rejects.toMatchObject({ code: 'NOT_ALLOWED' })
    stub('{"status":"error","message":"Not Allowed"}', 405)
    await expect(request('GET', 'a')).rejects.toMatchObject({ code: 'NOT_ALLOWED' })
  })
  it('maps 5xx to SERVER, rejection to NETWORK, other errors to OTHER', async () => {
    stub('boom', 500)
    await expect(request('GET', 'a')).rejects.toMatchObject({ code: 'SERVER', status: 500 })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fail') }))
    await expect(request('GET', 'a')).rejects.toMatchObject({ code: 'NETWORK' })
    stub('{"status":"error","message":"bad password"}', 200)
    await expect(request('POST', 'a', {})).rejects.toMatchObject({ code: 'OTHER', message: 'bad password' })
  })
  it('with text:true returns raw text', async () => {
    stub('line1\nline2')
    expect(await request('GET', 'admin/api/logs', undefined, { text: true })).toBe('line1\nline2')
  })
})
