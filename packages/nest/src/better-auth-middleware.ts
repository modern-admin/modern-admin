import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  isBetterAuthApiKeyRequest,
  type BetterAuthApiKeySource,
} from '@modern-admin/auth-better-auth'
import type { LocaleBundle } from '@modern-admin/i18n'
import { requestLocale, translateServerMessage } from './server-i18n.js'

/**
 * The two-argument shape that `toNodeHandler(auth)` from `better-auth/node`
 * returns. Using the Node.js built-in types means `@modern-admin/nest`
 * does not need `better-auth` as a direct dependency.
 */
type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>

/**
 * Paths under the Better Auth mount prefix that belong to
 * @modern-admin/nest's AuthController, not Better Auth itself.
 *
 * `toNodeHandler` is greedy — it handles every path under its mount
 * prefix and returns its own 404 for anything it doesn't recognise.
 * That means a raw `app.use('/admin/api/auth', toNodeHandler(auth))`
 * would shadow these NestJS endpoints and return 404 before NestJS ever
 * sees the request.
 */
const NEST_AUTH_PATHS: ReadonlySet<string> = new Set(['/me', '/login', '/ui-props'])

export interface BetterAuthMiddlewareOptions {
  /** The same Better Auth instance passed to `toNodeHandler`. Required for key detection. */
  auth: BetterAuthApiKeySource
  /** Host-defined translations for server errors. */
  serverLocales?: ReadonlyArray<LocaleBundle>
  /**
   * Additional API-key headers. The plugin's own matchers are always checked.
   * Default `['x-api-key']`.
   */
  apiKeyHeaders?: string | readonly string[]
}

const DEFAULT_API_KEY_HEADERS: readonly string[] = ['x-api-key']

/**
 * Creates an Express middleware that routes Better Auth's own paths
 * (`/sign-in/*`, `/sign-out`, `/session`, etc.) to the provided
 * `authHandler` while forwarding the three paths owned by
 * @modern-admin/nest's `AuthController` to NestJS via `next()`.
 *
 * Always use this instead of a bare `toNodeHandler(auth)` when both
 * Better Auth and the AuthController share the same mount prefix
 * (the canonical `/admin/api/auth`):
 *
 * ```ts
 * import { toNodeHandler } from 'better-auth/node'
 * import { createBetterAuthMiddleware } from '@modern-admin/nest'
 *
 * // main.ts — BEFORE any body parser:
 * app.use('/admin/api/auth', createBetterAuthMiddleware(toNodeHandler(auth), { auth }))
 * ```
 *
 * Must be mounted BEFORE Nest's body parsers so Better Auth can read
 * the raw request stream on sign-in/sign-out.
 *
 * Requests presenting an API key are answered 403 on every Better Auth
 * path. The api-key plugin turns a key into a full session of its owner, and
 * nothing on Better Auth's side knows about the key's `resource × action`
 * scope — so a read-only key could otherwise call `/get-session`,
 * `/list-sessions` (live browser session tokens of the owner) or
 * `/api-key/create` (a fresh, unrestricted key). Keys are for the admin data
 * API, which enforces their scope; account management stays session-only.
 */
export function createBetterAuthMiddleware(
  authHandler: NodeHandler,
  options: BetterAuthMiddlewareOptions,
): (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => Promise<void> {
  const apiKeyHeaders = toHeaderList(options.apiKeyHeaders)
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: unknown) => void,
  ): Promise<void> => {
    const path = (req.url ?? '').split('?')[0] ?? ''
    if (NEST_AUTH_PATHS.has(path)) {
      next()
      return
    }
    const headers = new Headers()
    for (const [name, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) value.forEach((item) => headers.append(name, item))
      else if (value !== undefined) headers.set(name, value)
    }
    let apiKeyRequest: boolean
    try {
      apiKeyRequest =
        apiKeyHeaders.some((name) => headers.has(name)) ||
        (await isBetterAuthApiKeyRequest(options.auth, headers, path, req.method ?? 'GET'))
    } catch (err) {
      next(err)
      return
    }
    if (apiKeyRequest) {
      res.statusCode = 403
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          code: 'API_KEY_NOT_ALLOWED',
          message: translateServerMessage(
            requestLocale(headers, options.serverLocales),
            'errors:apiKeyAuthForbidden',
            undefined,
            options.serverLocales,
          ),
        }),
      )
      return
    }
    await authHandler(req, res)
  }
}

/** Node lower-cases incoming header names, so the lookup list must match. */
const toHeaderList = (headers: BetterAuthMiddlewareOptions['apiKeyHeaders']): string[] =>
  (headers === undefined
    ? DEFAULT_API_KEY_HEADERS
    : typeof headers === 'string'
      ? [headers]
      : headers
  ).map((name) => name.toLowerCase())
