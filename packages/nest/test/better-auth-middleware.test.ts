import { describe, expect, test } from 'bun:test'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createBetterAuthMiddleware } from '../src/better-auth-middleware.js'

interface Outcome {
  handled: boolean
  next: boolean
  status?: number
  body?: unknown
}

const run = (
  url: string,
  headers: Record<string, string>,
  options?: Parameters<typeof createBetterAuthMiddleware>[1],
): Outcome => {
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
  middleware(
    { url, headers: lowered } as unknown as IncomingMessage,
    res as unknown as ServerResponse,
    () => {
      outcome.next = true
    },
  )
  return outcome
}

describe('createBetterAuthMiddleware', () => {
  test('session requests reach Better Auth', () => {
    expect(run('/list-sessions', { cookie: 's=1' })).toEqual({ handled: true, next: false })
  })

  test.each(['/get-session', '/list-sessions', '/api-key/create', '/admin/list-users'])(
    'an API key cannot reach %s',
    (path) => {
      const outcome = run(path, { 'x-api-key': 'k' })
      expect(outcome.handled).toBe(false)
      expect(outcome.next).toBe(false)
      expect(outcome.status).toBe(403)
      expect(outcome.body).toMatchObject({ code: 'API_KEY_NOT_ALLOWED' })
    },
  )

  test('an empty API-key header still counts as presenting one', () => {
    expect(run('/get-session', { 'x-api-key': '' }).status).toBe(403)
  })

  test('custom apiKeyHeaders are honoured, case-insensitively', () => {
    const options = { apiKeyHeaders: ['X-Service-Token'] }
    expect(run('/get-session', { 'x-service-token': 'k' }, options).status).toBe(403)
    // Only the configured names are checked once the list is overridden.
    expect(run('/get-session', { 'x-api-key': 'k' }, options).handled).toBe(true)
  })

  test('Nest-owned paths are forwarded, key or not — the Nest guard decides', () => {
    expect(run('/me', { 'x-api-key': 'k' })).toEqual({ handled: false, next: true })
    expect(run('/ui-props?x=1', {})).toEqual({ handled: false, next: true })
  })
})
