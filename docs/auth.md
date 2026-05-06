---
title: Authentication
description: IAuthProvider port and the bundled Better Auth implementation.
---

# Authentication

Modern Admin treats authentication as a **port**: core defines the
`IAuthProvider` interface, and concrete packages plug a real provider in.

## The port

```ts
interface IAuthProvider {
  /** Resolve the current admin from a transport request, or null if none. */
  getCurrentUser(req: unknown): Promise<CurrentAdmin | null>

  /** Optional UI hints — name, logo, OAuth button list. */
  getUiProps?(): Record<string, unknown>

  /** Optional session-management hooks called by built-in login/logout
   *  controllers. Skip when you mount sign-in routes yourself. */
  handleLogin?(req: unknown, res: unknown): Promise<CurrentAdmin>
  handleLogout?(req: unknown, res: unknown): Promise<void>
}
```

Resources, actions, and decorators receive `currentAdmin` in their context
and use it inside `isAccessible` / `isVisible` predicates:

```ts
{
  id: 'AuditLog',
  options: {
    actions: {
      delete: {
        isAccessible: ({ currentAdmin }) => currentAdmin?.role === 'admin',
      },
    },
  },
}
```

## Better Auth

`@modern-admin/auth-better-auth` wraps [Better Auth] — sessions, OAuth,
passkeys, magic links, 2FA — and exposes them as an `IAuthProvider`:

```ts
import { betterAuth } from 'better-auth'
import { BetterAuthProvider } from '@modern-admin/auth-better-auth'

const auth = betterAuth({
  database: { provider: 'postgres', url: process.env.DATABASE_URL! },
  emailAndPassword: { enabled: true },
  socialProviders: {
    github: { clientId: ..., clientSecret: ... },
  },
})

ModernAdminModule.forRoot({
  databases: [...],
  resources: [...],
  auth: new BetterAuthProvider(auth),
})
```

Better Auth mounts its own routes (`/api/auth/*`) — we just consume sessions
from `req` to populate `currentAdmin`.

## Anonymous mode

The default `IAuthProvider` returns `null`, leaving every action public.
This is appropriate for local dev or read-only deployments behind another
auth layer.

## Per-action permissions

Use `isAccessible` to gate individual actions, or wrap a resource with the
`accessible` ResourceOption to set a base policy. Predicates run inside
`ModernAdmin.invoke()` before the action handler and short-circuit with
`403 Forbidden` (or the GraphQL equivalent).

[Better Auth]: https://www.better-auth.com
