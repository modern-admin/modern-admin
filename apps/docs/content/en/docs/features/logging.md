---
title: Action logging
description: actionLoggingFeature / actionLoggingPlugin — persist every action invocation to an audit log.
---

# Action logging — `@modern-admin/feature-logging`

Persists every action invocation (who did what, when, with what payload/result) to an
`ILogStore`. Useful for compliance, debugging, and security auditing.

---

## How it works

- Appends `after` hooks to configured actions
- Captures: resource id, action name, timestamp, user id, record id(s)
- Optionally includes the request payload and response result
- Swallows store errors so logging never breaks the action

---

## Installation

```sh
bun add @modern-admin/feature-logging
# Pick a store implementation:
bun add @modern-admin/system-prisma   # Prisma store
bun add @modern-admin/system-drizzle  # Drizzle store
```

---

## Global plugin (recommended)

```ts
import { actionLoggingPlugin } from '@modern-admin/feature-logging'
import { PrismaLogStore } from '@modern-admin/system-prisma'

ModernAdminModule.forRoot({
  plugins: [
    actionLoggingPlugin({
      store: new PrismaLogStore(prisma),
      actions: ['new', 'edit', 'delete', 'bulkDelete'],  // default
      includePayload: true,    // capture request payload in log entry
      includeResult: false,    // capture response record params
      include: ['users', 'orders'],   // only these resources
      exclude: ['health-check'],      // skip noisy resources
    }),
  ],
})
```

### Options reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `store` | `ILogStore \| LogCallback` | — | Where to write log entries |
| `actions` | `string[]` | `['new','edit','delete','bulkDelete']` | Actions to log |
| `includePayload` | `boolean` | `false` | Include request payload in entry |
| `includeResult` | `boolean` | `false` | Include response record params in entry |
| `include` | `string[]` | all | Whitelist of resource ids |
| `exclude` | `string[]` | none | Blacklist of resource ids |

---

## Callback variant

For lightweight logging without a store:

```ts
actionLoggingPlugin({
  store: (entry) => {
    console.log('[AUDIT]', entry.action, entry.resourceId, entry.userId)
    // Send to external service, write to custom table, etc.
  },
})
```

---

## Per-resource variant

```ts
import { actionLoggingFeature } from '@modern-admin/feature-logging'

{
  resource: UsersResource,
  features: [
    actionLoggingFeature({
      store: logStore,
      actions: ['new', 'edit'],  // only log these actions for users
      includePayload: true,
    }),
  ],
}
```

---

## Log entry shape

```ts
interface LogEntry {
  id: string            // UUID v7
  resourceId: string
  recordId?: string
  recordIds?: string[]  // for bulkDelete
  action: string
  userId?: string
  payload?: unknown     // when includePayload: true
  result?: unknown      // when includeResult: true
  createdAt: Date
}
```

---

## Store implementations

### PrismaLogStore

Requires the `AdminAuditLog` model. Use `modern-admin generate` to append it.

### Custom store

Implement `ILogStore`:

```ts
interface ILogStore {
  log(entry: LogEntry): Promise<void>
  list(query: LogQuery): Promise<LogEntry[]>
}
```

---

## UI — Audit log page

When `logStore` is configured in `ModernAdminModule.forRoot()`, the audit log page is
automatically available in the admin sidebar. It shows a timeline of all logged actions
with filtering by resource, action type, actor, and date range.

See the [API](../api/rest) page for the `GET /admin/api/audit-log` endpoint reference.

---

## What it gives you

- Compliance-ready trail with user attribution
- Optional payload/result capture for debugging
- Resource-level filtering via `include` / `exclude`
- Simple callback alternative for lightweight logging
- Zero impact on action execution (store errors are swallowed)
