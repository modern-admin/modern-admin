import type { Request, Response, NextFunction } from 'express'
import type { IncomingMessage, ServerResponse } from 'node:http'

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
 * app.use('/admin/api/auth', createBetterAuthMiddleware(toNodeHandler(auth)))
 * ```
 *
 * Must be mounted BEFORE Nest's body parsers so Better Auth can read
 * the raw request stream on sign-in/sign-out.
 */
export function createBetterAuthMiddleware(
  authHandler: NodeHandler,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const path = (req.url ?? '').split('?')[0] ?? ''
    if (NEST_AUTH_PATHS.has(path)) {
      next()
      return
    }
    void authHandler(req as IncomingMessage, res as unknown as ServerResponse)
  }
}
