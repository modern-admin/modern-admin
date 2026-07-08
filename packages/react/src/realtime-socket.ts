// Default socket.io transport for `useRealtimeInvalidation`, matching the
// `@modern-admin/realtime` NestJS gateway: namespace `admin/realtime`,
// event name `modernAdmin:realtime`, room opt-in via the `subscribe`
// message. Kept separate from realtime.ts so the transport-agnostic hook
// carries no socket.io dependency for hosts that bring their own wire.

import { io } from 'socket.io-client'
import type { RealtimeSubscriber, RealtimeWireEvent } from './realtime.js'

/** Mirrors `REALTIME_EVENT` in `@modern-admin/realtime` (packages/realtime/src/tokens.ts). */
const REALTIME_EVENT = 'modernAdmin:realtime'

/** Mirrors the gateway's `@WebSocketGateway({ namespace })`. */
const REALTIME_NAMESPACE = '/admin/realtime'

export interface SocketRealtimeOptions {
  /** Absolute API origin (AdminClient's `baseUrl`); '' = same origin. */
  baseUrl?: string
  /** Forward cookies on the handshake (Better Auth sessions). */
  withCredentials?: boolean
}

/**
 * Build a `RealtimeSubscriber` backed by socket.io. The connection is
 * established lazily on first subscription and torn down when the last
 * unsubscribe runs, so an unmounted admin shell holds no socket open.
 */
export function createSocketRealtimeSubscriber(
  options: SocketRealtimeOptions = {},
): RealtimeSubscriber {
  return (handler) => {
    const socket = io(`${options.baseUrl ?? ''}${REALTIME_NAMESPACE}`, {
      withCredentials: options.withCredentials ?? true,
      // Long-polling fallback stays enabled (socket.io default) so the
      // bridge works behind proxies that block WebSocket upgrades.
    })
    const onEvent = (event: RealtimeWireEvent): void => {
      if (event && typeof event.resourceId === 'string') handler(event)
    }
    socket.on(REALTIME_EVENT, onEvent)
    // Join the firehose room — the admin shell wants every resource. The
    // gateway re-broadcasts nothing until the room is joined, so re-join
    // after every (re)connect, not just once.
    const joinAll = (): void => {
      socket.emit('subscribe', { all: true })
    }
    socket.on('connect', joinAll)
    return () => {
      socket.off(REALTIME_EVENT, onEvent)
      socket.off('connect', joinAll)
      socket.disconnect()
    }
  }
}
