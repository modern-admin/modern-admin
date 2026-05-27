import { Inject, type OnModuleInit } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import type { IRealtimeBus, RealtimeEvent } from '@modern-admin/core'
import { REALTIME_BUS, REALTIME_EVENT } from './tokens.js'

/**
 * Minimal duck-typed surface of a socket.io-style server we rely on. Kept
 * structural so we don't import socket.io directly and so consumers that
 * use a different platform adapter (ws, uWebSockets) can still wire this
 * gateway as long as `emit` and `to(room).emit` exist.
 */
interface RealtimeServerLike {
  emit(event: string, ...args: unknown[]): unknown
  to?(room: string): { emit(event: string, ...args: unknown[]): unknown }
}

interface RealtimeSocketLike {
  id: string
  join?(room: string): unknown
  leave?(room: string): unknown
  emit(event: string, ...args: unknown[]): unknown
}

const ALL_ROOM = 'modern-admin:all'
const resourceRoom = (resourceId: string): string => `modern-admin:resource:${resourceId}`

/**
 * NestJS WebSocket gateway. On bootstrap subscribes to the realtime bus and
 * fans events out to socket.io clients. Clients can opt into per-resource
 * rooms via the `subscribe` / `unsubscribe` messages to reduce noise.
 */
@WebSocketGateway({
  namespace: 'admin/realtime',
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayInit, OnModuleInit {
  @WebSocketServer()
  public server!: RealtimeServerLike

  private unsubscribe: (() => void) | null = null

  constructor(@Inject(REALTIME_BUS) private readonly bus: IRealtimeBus) {}

  async onModuleInit(): Promise<void> {
    if (this.unsubscribe) return
    this.unsubscribe = await this.bus.subscribe((event) => {
      this.broadcast(event)
    })
  }

  afterInit(): void {
    // Hook reserved for socket.io middleware injection by consumers.
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
  handleSubscribe(
    @MessageBody() body: { resourceId?: string; all?: boolean },
    @ConnectedSocket() client: RealtimeSocketLike,
  ): { ok: true } {
    if (body?.all && typeof client.join === 'function') {
      client.join(ALL_ROOM)
    }
    if (body?.resourceId && typeof client.join === 'function') {
      client.join(resourceRoom(body.resourceId))
    }
    return { ok: true }
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @MessageBody() body: { resourceId?: string; all?: boolean },
    @ConnectedSocket() client: RealtimeSocketLike,
  ): { ok: true } {
    if (body?.all && typeof client.leave === 'function') {
      client.leave(ALL_ROOM)
    }
    if (body?.resourceId && typeof client.leave === 'function') {
      client.leave(resourceRoom(body.resourceId))
    }
    return { ok: true }
  }
}
