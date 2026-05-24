---
title: Webhooks (Pro)
description: webhookPlugin — outbound HTTP events on record mutations with pluggable dispatch and HMAC signing.
---

# Webhooks — `@modern-admin-pro/feature-webhooks`

> **Pro tier.** This plugin ships as part of **Modern Admin Pro** ($20/dev/month, $50/dev/month Enterprise).
> The open-core release includes the `IWebhookStore` port and storage adapters; the
> mutation hooks, dispatcher, HMAC signing, and admin UI ship in the Pro registry.
> Learn more & subscribe at [modernadminpro.com](https://modernadminpro.com).

Dispatches outbound HTTP POST requests when records are created, updated, or deleted.
Webhook subscriptions are managed from the admin UI; delivery is pluggable (in-memory,
BullMQ, custom).

---

## How it works

- Installs `after` hooks on `new`, `edit`, `delete` actions
- Reads webhook subscriptions from an `IWebhookStore`
- Matches subscriptions by event pattern (`resourceId.action`) and optional filters
- Projects record fields via `payloadFields` to control payload size
- Enqueues delivery jobs via `IWebhookDispatcher`

---

## Installation

```sh
bun add @modern-admin-pro/feature-webhooks
# Store implementation:
bun add @modern-admin/system-prisma   # Prisma store
bun add @modern-admin/system-drizzle  # Drizzle store
# BullMQ dispatcher (optional, for reliable delivery):
bun add @modern-admin/queue bullmq @nestjs/bullmq
```

---

## Configuration

```ts
import { webhookPlugin } from '@modern-admin-pro/feature-webhooks'
import { PrismaWebhookStore } from '@modern-admin/system-prisma'
import { BullMQWebhookDispatcher } from '@modern-admin-pro/feature-webhooks/dispatchers'

ModernAdminModule.forRoot({
  plugins: [
    webhookPlugin({
      store: new PrismaWebhookStore(prisma),
      dispatcher: new BullMQWebhookDispatcher(queue),
      include: ['users', 'orders'],
      exclude: ['sessions'],
      userIdResolver: (admin) => admin?.id,
      payloadBuilder: ({
        webhook, event, resourceId, recordId,
        record, previousRecord, actorId,
      }) => ({
        id: uuidv7(),
        event,
        resourceId,
        recordId,
        actorId,
        occurredAt: new Date().toISOString(),
        record,
        ...(previousRecord ? { previousRecord } : {}),
      }),
    }),
  ],
})
```

### Options reference

| Option | Type | Description |
|--------|------|-------------|
| `store` | `IWebhookStore` | Subscription registry |
| `dispatcher` | `IWebhookDispatcher` | Delivery backend |
| `include` | `string[]` | Whitelist of resource ids |
| `exclude` | `string[]` | Blacklist of resource ids |
| `userIdResolver` | `(admin) => string` | Custom actor id extractor |
| `payloadBuilder` | `(ctx) => unknown` | Custom payload factory |

---

## Webhook subscription shape

```ts
{
  id: string
  url: string
  events: string[]           // e.g. ['created', 'updated'] or ['*']
  resources: string[]        // resource ids, or ['*'] for all
  payloadFields?: string[]   // fields to include in payload (projection)
  headers?: Record<string, string>
  filters?: Record<string, string>
  secret?: string            // for HMAC-SHA256 signature
  enabled: boolean
}
```

---

## Custom request headers

Use `headers` to attach static headers to every delivery — API tokens, tenant
identifiers, routing keys, or anything else the receiving server expects:

```ts
// Receiver authenticates via a Bearer token
{
  url: 'https://hooks.myapp.com/admin-events',
  events: ['users.created', 'users.updated'],
  headers: {
    'Authorization': 'Bearer s3cr3t-token-from-env',
    'X-Source': 'modern-admin',
    'X-Tenant-Id': 'acme',
  },
}

// Slack incoming webhook — no extra headers needed, but you could add:
{
  url: 'https://hooks.slack.com/services/T00/B00/xxx',
  events: ['orders.created'],
  headers: {
    'Content-Type': 'application/json',
  },
}
```

> **Tip:** Never hardcode secrets in source. Store them in environment
> variables and inject them at startup. Use the `secret` field for
> HMAC-SHA256 signature verification instead when possible.

---

## Delivery filters

`filters` lets you skip deliveries when the mutated record doesn't match a set
of field conditions. Each entry is `{ field: value }` and all conditions must
match (AND semantics). Values are matched case-insensitively as string equality.

```ts
// Only fire when an order's status becomes 'shipped'
{
  url: 'https://hooks.myapp.com/fulfillment',
  events: ['orders.updated'],
  filters: {
    status: 'shipped',
  },
}

// Only fire for enterprise-tier users
{
  url: 'https://hooks.myapp.com/crm',
  events: ['users.created'],
  filters: {
    tier: 'enterprise',
  },
}

// Combine multiple conditions — only published posts in the 'engineering' category
{
  url: 'https://hooks.myapp.com/cms-sync',
  events: ['posts.created', 'posts.updated'],
  filters: {
    published: 'true',
    category: 'engineering',
  },
}
```

> **Note:** Filters are matched against the record snapshot **after** the
> mutation. For `delete` events the snapshot is the state of the record
> immediately before deletion. If the record doesn't satisfy every filter,
> the delivery is skipped without being recorded in the delivery log.

---

## Dispatchers

### InMemoryWebhookDispatcher (default)

Fires HTTP requests synchronously in the action's `after` hook. Suitable for
development; not recommended for production (no retry, no persistence).

### BullMQWebhookDispatcher

Enqueues a BullMQ job for each matching subscription. Provides automatic retry,
exponential backoff, and delivery history.

```ts
import { BullMQWebhookDispatcher } from '@modern-admin-pro/feature-webhooks/dispatchers'

new BullMQWebhookDispatcher(webhooksQueue)
```

### Custom dispatcher

```ts
interface IWebhookDispatcher {
  dispatch(payload: WebhookDeliveryPayload): Promise<void>
}
```

---

## HMAC signing

When a subscription has a `secret`, the dispatcher signs the serialised payload with
`HMAC-SHA256` and adds the signature as the `X-Modern-Admin-Signature-256` header:

```
X-Modern-Admin-Signature-256: sha256=<hex>
```

Verify on your server:

```ts
import { createHmac } from 'crypto'

function verify(payload: string, secret: string, signature: string): boolean {
  const expected = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex')
  return expected === signature
}
```

---

## UI — Webhook management

When `webhookStore` is configured, the admin sidebar gains a **Webhooks** section with:

- Create / edit / delete subscriptions
- Per-subscription delivery history (last N attempts)
- "Send test event" button to fire a `webhook.test` payload immediately

---

## REST API

```http
GET    /admin/api/webhooks
POST   /admin/api/webhooks
PATCH  /admin/api/webhooks/:id
DELETE /admin/api/webhooks/:id
GET    /admin/api/webhooks/:id/deliveries
POST   /admin/api/webhooks/:id/test
```

See the [API](../api/rest) page for full request/response documentation.

---

## What it gives you

- Event-driven integration with external systems
- Fine-grained event filtering by resource and action
- Field projection to control payload size
- Pluggable dispatch (in-memory, BullMQ, or custom)
- Actor tracking for audit context
- HMAC request signing
- Automatic retry via queue dispatcher
