// graphql-ws WebSocket server bootstrap. Attaches a `ws.Server({ noServer })`
// to the underlying HTTP server (via Nest's HttpAdapterHost) and hands matching
// `upgrade` events to graphql-ws' `useServer` integration so subscription
// operations execute against the dynamic admin schema.

import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { WebSocketServer } from 'ws'
import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import { useServer } from 'graphql-ws/use/ws'
import type { Disposable } from 'graphql-ws'
import { MODERN_ADMIN } from '@modern-admin/nest'
import type { CurrentAdmin, IRealtimeBus, ModernAdmin } from '@modern-admin/core'
import { ModernAdminGraphqlSchemaHolder } from './schema-holder.js'
import { createContext } from './schema-builder.js'
import { GRAPHQL_OPTIONS, GRAPHQL_REALTIME_BUS } from './tokens.js'
import type { ResolvedGraphqlOptions } from './module.js'

/**
 * Per-socket `extra` graphql-ws hands to every hook. `request` is the raw HTTP
 * upgrade request (set by the ws integration before `onConnect`); we resolve
 * the principal from its cookies there and stash it on `currentAdmin` so the
 * `context` factory can read it without re-resolving.
 */
interface ConnectionExtra {
  request?: IncomingMessage
  currentAdmin?: CurrentAdmin
}

@Injectable()
export class GraphqlSubscriptionServer
implements OnApplicationBootstrap, OnApplicationShutdown
{
  private wsServer: WebSocketServer | null = null
  private disposer: Disposable | null = null
  private upgradeHandler: ((req: IncomingMessage, socket: Socket, head: Buffer) => void) | null =
    null

  constructor(
    @Inject(MODERN_ADMIN) private readonly admin: ModernAdmin,
    @Inject(GRAPHQL_OPTIONS) private readonly options: ResolvedGraphqlOptions,
    @Inject(GRAPHQL_REALTIME_BUS) private readonly bus: IRealtimeBus | null,
    private readonly schemaHolder: ModernAdminGraphqlSchemaHolder,
    private readonly adapterHost: HttpAdapterHost,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.options.subscriptionsEnabled) return
    const httpServer = this.adapterHost?.httpAdapter?.getHttpServer?.()
    if (!httpServer || typeof httpServer.on !== 'function') {

      console.warn(
        '[modern-admin/graphql] subscriptions enabled but HTTP server is unavailable; skipping graphql-ws bootstrap',
      )
      return
    }

    const wsServer = new WebSocketServer({ noServer: true })
    this.wsServer = wsServer

    const targetPath = this.options.subscriptionsPath
    this.upgradeHandler = (req, socket, head) => {
      const url = req.url ?? ''
      // Strip a possible querystring before path matching.
      const pathname = url.split('?', 1)[0]
      if (pathname !== targetPath) return
      wsServer.handleUpgrade(req, socket, head, (ws) => {
        wsServer.emit('connection', ws, req)
      })
    }
    httpServer.on('upgrade', this.upgradeHandler)

    this.disposer = useServer(
      {
        schema: () => this.schemaHolder.get(),
        // Authenticate the WebSocket at upgrade time, server-side. Identity is
        // resolved from the upgrade request's cookies via the configured
        // IAuthProvider — never from client-supplied `connectionParams`, which
        // a client could forge (`{ currentAdmin: { role: 'admin' } }`) to gain
        // full CRUD. Anonymous upgrades are rejected (graphql-ws closes with
        // 4403 Forbidden). Mirrors the REST/HTTP-GraphQL auth guard.
        onConnect: async (ctx) => {
          const extra = ctx.extra as unknown as ConnectionExtra
          const currentAdmin = extra.request
            ? await this.admin.auth.getCurrentUser(extra.request)
            : null
          if (!currentAdmin) return false
          extra.currentAdmin = currentAdmin
          return true
        },
        context: (ctx) => {
          const { currentAdmin } = ctx.extra as unknown as ConnectionExtra
          return createContext(this.admin, currentAdmin, this.bus ?? undefined)
        },
      },
      wsServer,
    )
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.disposer) {
      try {
        await this.disposer.dispose()
      } catch {
        // ignore
      }
      this.disposer = null
    }
    if (this.wsServer) {
      const ws = this.wsServer
      this.wsServer = null
      await new Promise<void>((resolve) => ws.close(() => resolve()))
    }
    if (this.upgradeHandler) {
      const httpServer = this.adapterHost?.httpAdapter?.getHttpServer?.()
      if (httpServer && typeof httpServer.off === 'function') {
        httpServer.off('upgrade', this.upgradeHandler)
      }
      this.upgradeHandler = null
    }
  }
}
