import { beforeEach, describe, expect, it } from 'bun:test'
import { InMemoryRealtimeBus, type RealtimeEvent } from '@modern-admin/core'
import { RealtimeGateway } from '../src/gateway.js'
import { REALTIME_EVENT } from '../src/tokens.js'

interface FakeRoom {
  emit: (event: string, payload: unknown) => void
}

class FakeServer {
  emits: Array<{ event: string; args: unknown[] }> = []
  rooms = new Map<string, FakeRoom>()
  roomEmits: Array<{ room: string; event: string; payload: unknown }> = []

  emit(event: string, ...args: unknown[]): void {
    this.emits.push({ event, args })
  }

  to(room: string): FakeRoom {
    const handle: FakeRoom = {
      emit: (event, payload) => {
        this.roomEmits.push({ room, event, payload })
      },
    }
    this.rooms.set(room, handle)
    return handle
  }
}

class FakeSocket {
  id = 'socket-1'
  joined: string[] = []
  left: string[] = []
  emits: Array<{ event: string; args: unknown[] }> = []

  join(room: string): void {
    this.joined.push(room)
  }
  leave(room: string): void {
    this.left.push(room)
  }
  emit(event: string, ...args: unknown[]): void {
    this.emits.push({ event, args })
  }
}

const sample: RealtimeEvent = {
  kind: 'updated',
  resourceId: 'users',
  recordId: '42',
  at: 1700000000000,
}

describe('RealtimeGateway', () => {
  let bus: InMemoryRealtimeBus
  let gateway: RealtimeGateway
  let server: FakeServer

  beforeEach(async () => {
    bus = new InMemoryRealtimeBus()
    gateway = new RealtimeGateway(bus)
    server = new FakeServer()
    gateway.server = server
    await gateway.onModuleInit()
  })

  it('subscribes to the bus on module init and forwards events to rooms', async () => {
    await bus.publish(sample)
    const resourceRoom = server.roomEmits.find((e) => e.room === 'modern-admin:resource:users')
    const allRoom = server.roomEmits.find((e) => e.room === 'modern-admin:all')
    expect(resourceRoom).toBeDefined()
    expect(allRoom).toBeDefined()
    expect(resourceRoom!.event).toBe(REALTIME_EVENT)
    expect(resourceRoom!.payload).toEqual(sample)
  })

  it('broadcast() falls back to plain emit when server has no rooms', () => {
    const plain = new (class {
      emits: Array<{ event: string; args: unknown[] }> = []
      emit(event: string, ...args: unknown[]): void {
        this.emits.push({ event, args })
      }
    })()
    gateway.server = plain as never
    gateway.broadcast(sample)
    expect(plain.emits).toHaveLength(1)
    expect(plain.emits[0]!.event).toBe(REALTIME_EVENT)
  })

  it('subscribe message joins resource and global rooms', () => {
    const socket = new FakeSocket()
    const result = gateway.handleSubscribe({ resourceId: 'posts', all: true }, socket)
    expect(result.ok).toBe(true)
    expect(socket.joined).toContain('modern-admin:resource:posts')
    expect(socket.joined).toContain('modern-admin:all')
  })

  it('unsubscribe message leaves the requested rooms', () => {
    const socket = new FakeSocket()
    gateway.handleSubscribe({ resourceId: 'posts', all: true }, socket)
    gateway.handleUnsubscribe({ resourceId: 'posts', all: true }, socket)
    expect(socket.left).toContain('modern-admin:resource:posts')
    expect(socket.left).toContain('modern-admin:all')
  })

  it('does not double-subscribe when onModuleInit runs more than once', async () => {
    const before = server.roomEmits.length
    await gateway.onModuleInit()
    await bus.publish(sample)
    const after = server.roomEmits.length - before
    // 2 emits per event (resource room + all room).
    expect(after).toBe(2)
  })
})
