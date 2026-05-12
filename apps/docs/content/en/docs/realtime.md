---
title: Realtime
description: WebSocket gateway and the IRealtimeBus port for cross-instance fan-out.
---

# Realtime

Modern Admin emits a `RealtimeEvent` every time an action mutates data:

```ts
interface RealtimeEvent {
  kind: 'created' | 'updated' | 'deleted'
  resourceId: string
  recordId?: string
  record?: Record<string, unknown>
  actorId?: string
  at: number      // Unix ms
}
```

Events flow through an `IRealtimeBus`, then out to subscribed WebSocket
clients via the `RealtimeGateway` in `@modern-admin/realtime`.

## In-memory bus (single instance)

```ts
import { InMemoryRealtimeBus } from '@modern-admin/core'
import { ModernAdminRealtimeModule } from '@modern-admin/realtime'

const bus = new InMemoryRealtimeBus()

ModernAdminModule.forRoot({ ..., realtime: bus })
ModernAdminRealtimeModule.forRoot({ bus })
```

Events stay inside the process — appropriate for local dev or single-pod
deployments.

## Redis-backed bus (multi-instance)

```ts
import Redis from 'ioredis'
import { RedisRealtimeBus } from '@modern-admin/realtime'

const bus = new RedisRealtimeBus({
  client: new Redis(process.env.REDIS_URL!),
  channel: 'modern-admin:realtime',
})

ModernAdminModule.forRoot({ ..., realtime: bus })
ModernAdminRealtimeModule.forRoot({ bus })
```

Each instance subscribes to the same Redis channel. Mutations on any pod
publish to Redis; every gateway receives the event and broadcasts to its
local WebSocket clients.

## Wire format on the client

```
namespace: /admin/realtime

→ subscribe   { resourceIds?: string[] | 'all' }
→ unsubscribe { resourceIds?: string[] | 'all' }

← realtime:event { kind, resourceId, recordId?, record?, actorId?, at }
```

Subscribers join socket.io rooms named `modern-admin:resource:<id>` or
`modern-admin:all`; the gateway emits to those rooms.

## React integration

`@modern-admin/react` ships `useRealtimeInvalidation`:

```tsx
import { useRealtimeInvalidation } from '@modern-admin/react'
import { io } from 'socket.io-client'

const socket = io('/admin/realtime')
const subscriber = (h) => {
  socket.on('realtime:event', h)
  return () => socket.off('realtime:event', h)
}

function Live(): null {
  useRealtimeInvalidation(subscriber)
  return null
}
```

Every event invalidates `[resourceId, ...]` queries — list, show, count
all refetch automatically. For optimistic UI on deletes, call
`applyDeletionLocally(queryClient, resourceId, recordId)` before the
server confirms.
