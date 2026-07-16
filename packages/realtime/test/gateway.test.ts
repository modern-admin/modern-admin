import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { InMemoryRealtimeBus, type CurrentAdmin, type ModernAdmin, type RealtimeEvent } from '@modern-admin/core'
import { RealtimeGateway, configureRealtimeOrigins, isOriginAllowed } from '../src/gateway.js'
import { REALTIME_EVENT } from '../src/tokens.js'

interface FakeRoom {
  emit: (event: string, payload: unknown) => void
}

type Middleware = (socket: FakeSocket, next: (err?: Error) => void) => void

class FakeServer {
  emits: Array<{ event: string; args: unknown[] }> = []
  rooms = new Map<string, FakeRoom>()
  roomEmits: Array<{ room: string; event: string; payload: unknown }> = []
  middleware: Middleware | null = null

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

  use(fn: Middleware): void {
    this.middleware = fn
  }
}

class FakeSocket {
  id = 'socket-1'
  joined: string[] = []
  left: string[] = []
  emits: Array<{ event: string; args: unknown[] }> = []
  handshake: { headers?: Record<string, unknown> }
  data?: { currentAdmin?: CurrentAdmin }

  constructor(headers: Record<string, unknown> = { cookie: 'session=abc' }) {
    this.handshake = { headers }
  }

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

/**
 * Minimal ModernAdmin double: a fixed principal returned from the auth port
 * and an allowlist of resources this principal may `list`. `canAccess` mirrors
 * the real gate's contract (false for anonymous / disallowed resources).
 */
class FakeAdmin {
  user: CurrentAdmin | null = { id: 'admin-1', role: 'admin' }
  allowed = new Set<string>(['users', 'posts'])
  resources = [{ id: () => 'users' }, { id: () => 'posts' }]
  auth = {
    getCurrentUser: async (_ctx: unknown): Promise<CurrentAdmin | null> => this.user,
  }
  async canAccess(resourceId: string, _action: string, currentAdmin?: CurrentAdmin): Promise<boolean> {
    return Boolean(currentAdmin) && this.allowed.has(resourceId)
  }
}

const sample: RealtimeEvent = {
  kind: 'updated',
  resourceId: 'users',
  recordId: '42',
  at: 1700000000000,
}

const asAdmin = (a: FakeAdmin): ModernAdmin => a as unknown as ModernAdmin

describe('RealtimeGateway', () => {
  let bus: InMemoryRealtimeBus
  let admin: FakeAdmin
  let gateway: RealtimeGateway
  let server: FakeServer

  beforeEach(async () => {
    bus = new InMemoryRealtimeBus()
    admin = new FakeAdmin()
    gateway = new RealtimeGateway(bus, asAdmin(admin))
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

  describe('handshake authentication', () => {
    it('stashes the resolved principal and admits the connection', async () => {
      gateway.afterInit(server)
      const socket = new FakeSocket()
      const err = await new Promise<Error | undefined>((resolve) => {
        server.middleware!(socket, resolve)
      })
      expect(err).toBeUndefined()
      expect(socket.data?.currentAdmin?.id).toBe('admin-1')
    })

    it('rejects anonymous handshakes (getCurrentUser returns null)', async () => {
      admin.user = null
      gateway.afterInit(server)
      const socket = new FakeSocket()
      const err = await new Promise<Error | undefined>((resolve) => {
        server.middleware!(socket, resolve)
      })
      expect(err).toBeInstanceOf(Error)
      expect(socket.data?.currentAdmin).toBeUndefined()
    })

    it('does not register middleware on adapters without use()', () => {
      const bare = { emit() {}, to: () => ({ emit() {} }) }
      // Must not throw when the server exposes no `use`.
      expect(() => gateway.afterInit(bare as never)).not.toThrow()
    })
  })

  describe('per-principal room gating', () => {
    it('joins a resource room only when the principal may read it', async () => {
      const socket = new FakeSocket()
      socket.data = { currentAdmin: admin.user! }
      await gateway.handleSubscribe({ resourceId: 'posts' }, socket)
      expect(socket.joined).toContain('modern-admin:resource:posts')
    })

    it('refuses to join a resource the principal cannot read', async () => {
      admin.allowed = new Set(['users'])
      const socket = new FakeSocket()
      socket.data = { currentAdmin: admin.user! }
      await gateway.handleSubscribe({ resourceId: 'posts' }, socket)
      expect(socket.joined).not.toContain('modern-admin:resource:posts')
    })

    it('refuses every join for an unauthenticated socket', async () => {
      const socket = new FakeSocket()
      // No `data.currentAdmin` — e.g. a socket that slipped past without auth.
      await gateway.handleSubscribe({ resourceId: 'users', all: true }, socket)
      expect(socket.joined).toHaveLength(0)
    })

    it('{ all: true } joins one room per accessible resource, not a shared firehose', async () => {
      admin.allowed = new Set(['users'])
      const socket = new FakeSocket()
      socket.data = { currentAdmin: admin.user! }
      await gateway.handleSubscribe({ all: true }, socket)
      expect(socket.joined).toContain('modern-admin:resource:users')
      expect(socket.joined).not.toContain('modern-admin:resource:posts')
      expect(socket.joined).not.toContain('modern-admin:all')
    })
  })

  it('unsubscribe leaves the resource rooms', async () => {
    const socket = new FakeSocket()
    socket.data = { currentAdmin: admin.user! }
    await gateway.handleSubscribe({ resourceId: 'posts', all: true }, socket)
    gateway.handleUnsubscribe({ resourceId: 'posts', all: true }, socket)
    expect(socket.left).toContain('modern-admin:resource:posts')
    expect(socket.left).toContain('modern-admin:resource:users')
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

describe('realtime CORS origin allowlist', () => {
  afterEach(() => configureRealtimeOrigins(undefined))

  it('allows requests with no Origin header (non-browser clients)', () => {
    configureRealtimeOrigins(['https://admin.example.com'])
    expect(isOriginAllowed(undefined, 'admin.example.com')).toBe(true)
  })

  it('always allows same-origin handshakes (Origin host === Host)', () => {
    configureRealtimeOrigins(undefined)
    expect(isOriginAllowed('https://admin.example.com', 'admin.example.com')).toBe(true)
    expect(isOriginAllowed('http://localhost:3000', 'localhost:3000')).toBe(true)
  })

  it('allows a configured cross-origin and rejects others', () => {
    configureRealtimeOrigins(['https://admin.example.com'])
    expect(isOriginAllowed('https://admin.example.com', 'api.internal')).toBe(true)
    expect(isOriginAllowed('https://evil.example.com', 'api.internal')).toBe(false)
  })

  it('fails closed for foreign browser origins when no allowlist is configured', () => {
    configureRealtimeOrigins(undefined)
    expect(isOriginAllowed('https://evil.example.com', 'admin.example.com')).toBe(false)
  })
})
