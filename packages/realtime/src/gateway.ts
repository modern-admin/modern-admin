import { Inject, type OnModuleInit } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import type { CurrentAdmin, IRealtimeBus, ModernAdmin, RealtimeEvent } from '@modern-admin/core'
import { MODERN_ADMIN } from '@modern-admin/nest'
import { REALTIME_BUS, REALTIME_EVENT } from './tokens.js'

/**
 * Minimal duck-typed surface of a socket.io-style server we rely on. Kept
 * structural so we don't import socket.io directly and so consumers that
 * use a different platform adapter (ws, uWebSockets) can still wire this
 * gateway as long as `emit` / `to(room).emit` (and, for auth, `use`) exist.
 */
interface RealtimeServerLike {
  emit(event: string, ...args: unknown[]): unknown
  to?(room: string): { emit(event: string, ...args: unknown[]): unknown }
  /** socket.io connection middleware registration. Absent on bare adapters. */
  use?(fn: (socket: RealtimeSocketLike, next: (err?: Error) => void) => void): unknown
}

interface RealtimeSocketLike {
  id: string
  join?(room: string): unknown
  leave?(room: string): unknown
  emit(event: string, ...args: unknown[]): unknown
  /** socket.io handshake — carries the upgrade request headers (cookies). */
  handshake?: { headers?: Record<string, unknown> }
  /** Per-socket bag; we stash the authenticated principal here. */
  data?: { currentAdmin?: CurrentAdmin }
}

const ALL_ROOM = 'modern-admin:all'
const resourceRoom = (resourceId: string): string => `modern-admin:resource:${resourceId}`

/**
 * Extra browser origins allowed to open the realtime WebSocket, on top of the
 * server's own (same-origin is always allowed — see {@link isOriginAllowed}).
 * Configured via `ModernAdminRealtimeModule.forRoot({ origins })` or the
 * `MODERN_ADMIN_REALTIME_ORIGINS` env var (comma-separated). Read per handshake
 * so `forRoot` can set it after this module is imported (decorators evaluate at
 * import time, connections don't).
 */
let configuredOrigins: readonly string[] | null = null

/** Set the realtime cross-origin allowlist. Called by the module's `forRoot`. */
export const configureRealtimeOrigins = (origins: readonly string[] | undefined): void => {
  configuredOrigins = origins && origins.length > 0 ? [...origins] : null
}

const resolveAllowlist = (): readonly string[] => {
  if (configuredOrigins) return configuredOrigins
  const env = process.env.MODERN_ADMIN_REALTIME_ORIGINS
  if (!env) return []
  return env
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
}

/** True when the `Origin` header's host matches the request `Host` header. */
const isSameOrigin = (origin: string, host: string | undefined): boolean => {
  if (!host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/**
 * Origin gate for the socket.io handshake. Replaces the fail-open
 * `origin: true` (which reflected *any* origin *with credentials* — a
 * cross-site WebSocket hijacking vector). Allowed when:
 *   • there's no `Origin` header (native ws client, server-to-server), or
 *   • the origin is same-origin as the server (`Origin` host === `Host`), or
 *   • the origin is on the configured cross-origin allowlist.
 * Everything else is rejected — an unconfigured deploy still can't be
 * hijacked from a foreign site.
 */
export const isOriginAllowed = (origin: string | undefined, host?: string): boolean => {
  if (!origin) return true
  if (isSameOrigin(origin, host)) return true
  return resolveAllowlist().includes(origin)
}

/**
 * engine.io `allowRequest` gate — enforced server-side for BOTH the polling
 * and raw-WebSocket transports (browsers don't apply CORS to WebSocket, so the
 * `cors` response headers alone can't stop CSWSH; this actually refuses the
 * upgrade). `req` is the handshake HTTP request.
 */
const allowRequest = (
  req: { headers?: Record<string, unknown> },
  cb: (err: string | null | undefined, allow: boolean) => void,
): void => {
  const headers = req.headers ?? {}
  const origin = typeof headers.origin === 'string' ? headers.origin : undefined
  const host = typeof headers.host === 'string' ? headers.host : undefined
  const allowed = isOriginAllowed(origin, host)
  cb(allowed ? undefined : 'forbidden', allowed)
}

/**
 * NestJS WebSocket gateway. On bootstrap subscribes to the realtime bus and
 * fans events out to socket.io clients. Connections are authenticated at the
 * handshake (see {@link afterInit}); room joins are gated per principal so a
 * client only ever receives events for resources it may read.
 */
@WebSocketGateway({
  namespace: 'admin/realtime',
  // `allowRequest` is the security gate (works for the WebSocket transport);
  // `cors` sets the response headers cross-origin XHR/polling needs. The cors
  // `origin` callback can't see the request host, so same-origin is handled by
  // `allowRequest`; here we only reflect allowlisted cross-origins.
  allowRequest,
  cors: {
    origin: (origin, cb) => cb(null, !origin || resolveAllowlist().includes(origin)),
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayInit, OnModuleInit {
  @WebSocketServer()
  public server!: RealtimeServerLike

  private unsubscribe: (() => void) | null = null

  constructor(
    @Inject(REALTIME_BUS) private readonly bus: IRealtimeBus,
    @Inject(MODERN_ADMIN) private readonly admin: ModernAdmin,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.unsubscribe) return
    this.unsubscribe = await this.bus.subscribe((event) => {
      this.broadcast(event)
    })
  }

  afterInit(server?: RealtimeServerLike): void {
    // Authenticate every connection at the handshake, server-side, from the
    // session cookie — never trust the client. socket.io rejects the
    // connection when `next` receives an error. Skipped on bare adapters
    // that expose no `use()` (e.g. the test double), which never carry a
    // browser session anyway.
    const target = server ?? this.server
    if (!target || typeof target.use !== 'function') return
    target.use((socket, next) => {
      void this.authenticate(socket)
        .then((currentAdmin) => {
          if (!currentAdmin) {
            next(new Error('Unauthorized'))
            return
          }
          socket.data = { ...(socket.data ?? {}), currentAdmin }
          next()
        })
        .catch(() => next(new Error('Unauthorized')))
    })
  }

  private async authenticate(socket: RealtimeSocketLike): Promise<CurrentAdmin | null> {
    const headers = socket.handshake?.headers
    if (!headers) return null
    return this.admin.auth.getCurrentUser({ headers })
  }

  /** Broadcast an event to subscribers of the resource room and the global room. */
  broadcast(event: RealtimeEvent): void {
    const server = this.server
    if (!server) return
    if (typeof server.to === 'function') {
      server.to(resourceRoom(event.resourceId)).emit(REALTIME_EVENT, event)
      server.to(ALL_ROOM).emit(REALTIME_EVENT, event)
      return
    }
    server.emit(REALTIME_EVENT, event)
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @MessageBody() body: { resourceId?: string; all?: boolean },
    @ConnectedSocket() client: RealtimeSocketLike,
  ): Promise<{ ok: true }> {
    const currentAdmin = client.data?.currentAdmin
    if (typeof client.join !== 'function') return { ok: true }
    // `{ all: true }` is a per-principal firehose: join a resource room for
    // every resource this principal may read, rather than a shared ALL_ROOM
    // that would leak resources the principal has no access to.
    if (body?.all) {
      for (const resource of this.admin.resources) {
        const resourceId = resource.id()
        if (await this.admin.canAccess(resourceId, 'list', currentAdmin)) {
          client.join(resourceRoom(resourceId))
        }
      }
    }
    if (body?.resourceId && (await this.admin.canAccess(body.resourceId, 'list', currentAdmin))) {
      client.join(resourceRoom(body.resourceId))
    }
    return { ok: true }
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @MessageBody() body: { resourceId?: string; all?: boolean },
    @ConnectedSocket() client: RealtimeSocketLike,
  ): { ok: true } {
    if (typeof client.leave !== 'function') return { ok: true }
    if (body?.all) {
      for (const resource of this.admin.resources) {
        client.leave(resourceRoom(resource.id()))
      }
    }
    if (body?.resourceId) {
      client.leave(resourceRoom(body.resourceId))
    }
    return { ok: true }
  }
}
