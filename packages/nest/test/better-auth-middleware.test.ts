import { describe, expect, test } from 'bun:test'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createBetterAuthMiddleware } from '../src/better-auth-middleware.js'

interface Outcome {
  handled: boolean
  next: boolean
  status?: number
  body?: unknown
}

const run = async (
  url: string,
  headers: Record<string, string>,
  options: Parameters<typeof createBetterAuthMiddleware>[1] = { auth: {} },
): Promise<Outcome> => {
  const outcome: Outcome = { handled: false, next: false }
  const middleware = createBetterAuthMiddleware(() => {
    outcome.handled = true
  }, options)
  const res = {
    statusCode: 200,
    setHeader: () => {},
    end(chunk?: string) {
      outcome.status = this.statusCode
      outcome.body = chunk ? JSON.parse(chunk) : undefined
    },
  }
  // Node lower-cases incoming header names.
  const lowered = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  await middleware(
    { url, method: 'GET', headers: lowered } as unknown as IncomingMessage,
    res as unknown as ServerResponse,
    () => {
      outcome.next = true
    },
  )
  return outcome
}

describe('createBetterAuthMiddleware', () => {
  test('session requests reach Better Auth', async () => {
    expect(await run('/list-sessions', { cookie: 's=1' })).toEqual({ handled: true, next: false })
  })

  test.each(['/get-session', '/list-sessions', '/api-key/create', '/admin/list-users'])(
    'an API key cannot reach %s',
    async (path) => {
      const outcome = await run(path, { 'x-api-key': 'k' })
      expect(outcome.handled).toBe(false)
      expect(outcome.next).toBe(false)
      expect(outcome.status).toBe(403)
      expect(outcome.body).toMatchObject({ code: 'API_KEY_NOT_ALLOWED' })
    },
  )

  test('an empty API-key header still counts as presenting one', async () => {
    expect((await run('/get-session', { 'x-api-key': '' })).status).toBe(403)
  })

  test('custom apiKeyHeaders are honoured, case-insensitively', async () => {
    const options = { auth: {}, apiKeyHeaders: ['X-Service-Token'] }
    expect((await run('/get-session', { 'x-service-token': 'k' }, options)).status).toBe(403)
    // Only the configured names are checked once the list is overridden.
    expect((await run('/get-session', { 'x-api-key': 'k' }, options)).handled).toBe(true)
  })

  test('plugin-recognized headers are blocked even when the middleware header list differs', async () => {
    const auth = {
      options: {
        plugins: [
          {
            id: 'api-key',
            hooks: {
              before: [
                { matcher: (ctx: { headers: Headers }) => ctx.headers.has('x-private-key') },
              ],
            },
          },
        ],
      },
    }
    const outcome = await run(
      '/list-sessions',
      { 'x-private-key': 'secret' },
      { auth, apiKeyHeaders: ['x-other'] },
    )
    expect(outcome).toMatchObject({ handled: false, next: false, status: 403 })
  })

  test('a failing plugin matcher never reaches the account handler', async () => {
    const auth = {
      options: {
        plugins: [
          {
            id: 'api-key',
            hooks: {
              before: [
                {
                  matcher: () => {
                    throw new Error('getter failed')
                  },
                },
              ],
            },
          },
        ],
      },
    }
    expect(await run('/get-session', {}, { auth })).toEqual({ handled: false, next: true })
  })

  test('credential detection uses the actual Better Auth endpoint path', async () => {
    const auth = {
      options: {
        plugins: [
          {
            id: 'api-key',
            hooks: {
              before: [
                {
                  matcher: (ctx: { path: string; headers: Headers }) =>
                    ctx.path === '/list-sessions' && ctx.headers.has('x-private-key'),
                },
              ],
            },
          },
        ],
      },
    }
    expect((await run('/list-sessions', { 'x-private-key': 'k' }, { auth })).status).toBe(403)
  })

  test('API-key denials use the requested language and retain their stable code', async () => {
    const outcome = await run('/get-session', {
      'x-api-key': 'k',
      'accept-language': 'ru-RU, en;q=0.5',
    })
    expect(outcome.body).toEqual({
      code: 'API_KEY_NOT_ALLOWED',
      message: 'API-ключам запрещён доступ к эндпоинтам аутентификации.',
    })
  })

  test('Nest-owned paths are forwarded, key or not — the Nest guard decides', async () => {
    expect(await run('/me', { 'x-api-key': 'k' })).toEqual({ handled: false, next: true })
    expect(await run('/ui-props?x=1', {})).toEqual({ handled: false, next: true })
  })
})
