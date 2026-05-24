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

interface ConnectionParamsWithAdmin {
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
      // eslint-disable-next-line no-console
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
        context: (ctx) => {
          const params = (ctx.connectionParams ?? {}) as ConnectionParamsWithAdmin
          return createContext(this.admin, params.currentAdmin, this.bus ?? undefined)
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
