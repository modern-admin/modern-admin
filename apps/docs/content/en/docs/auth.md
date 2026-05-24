---
title: Authentication
description: Better Auth setup, IAuthProvider port, roles and API keys.
---

# Authentication

Modern Admin treats authentication as a **port**: `@modern-admin/core` defines the
`IAuthProvider` interface, and concrete packages implement it. The bundled implementation
is `@modern-admin/auth-better-auth` which wraps [Better Auth](https://www.better-auth.com)
— sessions, OAuth, passkeys, and API keys.

---

## How it works

```
Browser / API client
      │  cookie / x-api-key
      ▼
NestJS ModernAdminAuthGuard
      │  calls IAuthProvider.getCurrentUser(request)
      ▼
BetterAuthProvider
      │  calls auth.api.getSession({ headers })
      │  (if x-api-key present) calls auth.api.verifyApiKey({ body: { key } })
      ▼
CurrentAdmin { id, email, name, role?, apiKey? }
      │
      ▼
ModernAdmin.invoke()
      │  checks isAccessible() on the action
      │  checks rolesResourceId → role permissions matrix
      │  checks apiKey.permissions (for API key principals)
      ▼
Action handler
```

Every protected endpoint runs `ModernAdminAuthGuard` first. If `getCurrentUser` returns
`null`, the guard throws **401 Unauthorized**, which the frontend interprets as a signal
to show the login screen.

---

## IAuthProvider port

```ts
interface IAuthProvider {
  /** Resolve the admin from the transport request. Returns null when unauthenticated. */
  getCurrentUser(requestContext: unknown): Promise<CurrentAdmin | null>

  /** Optional: UI hints (list of login providers, etc.). */
  getUiProps?(): Record<string, unknown>

  /** Optional: called by the built-in login endpoint. */
  login?(credentials: LoginCredentials): Promise<CurrentAdmin | null>

  /** Optional: called by the built-in logout endpoint. */
  logout?(requestContext: unknown): Promise<void>
}

interface CurrentAdmin {
  id: string
  email?: string
  name?: string
  avatarUrl?: string
  role?: string        // role name, matched against rolesResourceId
  apiKey?: {           // present only for API key principals
    id: string
    name?: string
    permissions: Record<string, string[]>
  }
}
```

---

## Better Auth setup

### 1. Install

```sh
bun add better-auth @modern-admin/auth-better-auth @better-auth/api-key
```

### 2. Create the auth instance

Create a dedicated `auth.ts` file. Better Auth is configured once and its instance is
published on `globalThis` so the admin module can pick it up at module-load time.

**With bun:sqlite (dev / lightweight)**

```ts
// src/auth.ts
import { betterAuth } from 'better-auth'
import { apiKey } from '@better-auth/api-key'
import { admin } from 'better-auth/plugins'
import { Database } from 'bun:sqlite'

const sqlite = new Database(process.env.AUTH_DB_PATH ?? ':memory:')

export const auth = betterAuth({
  database: sqlite as never,          // bun:sqlite is wire-compatible with better-sqlite3
  baseURL: process.env.AUTH_BASE_URL ?? 'http://localhost:3001',
  trustedOrigins: ['http://localhost:3000', 'http://localhost:5173'],
  emailAndPassword: { enabled: true, autoSignIn: true },

  // Table names — all framework tables share the `ma_` prefix.
  user:         { modelName: 'ma_user' },
  session:      { modelName: 'ma_session' },
  account:      { modelName: 'ma_account' },
  verification: { modelName: 'ma_verification' },

  plugins: [
    // API key plugin — backs the Settings → API Keys page.
    apiKey({
      apiKeyHeaders: 'x-api-key',
      requireName: true,
      enableSessionForAPIKeys: true,  // synthesises a session for key-authenticated requests
      rateLimit: { enabled: false },
      schema: { apikey: { modelName: 'ma_apikey' } },
    }) as never,

    // Admin plugin — adds a `role` column to ma_user.
    // Set defaultRole to 'user' in production; 'admin' is useful for demo seeds.
    admin({ defaultRole: process.env.DEMO_ADMIN_ROLE ?? 'user' }) as never,
  ],
})

// Make the instance available to the admin module at module-load time.
;(globalThis as { __betterAuth?: unknown }).__betterAuth = auth
```

**With Prisma + Postgres (production)**

```ts
// src/auth.ts
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { apiKey } from '@better-auth/api-key'
import { admin } from 'better-auth/plugins'
import { prisma } from './db.js'   // your PrismaClient singleton

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  baseURL: process.env.AUTH_BASE_URL ?? 'http://localhost:3001',
  trustedOrigins: process.env.WEB_ORIGIN?.split(',') ?? [
    'http://localhost:3000',
    'http://localhost:5173',
  ],
  emailAndPassword: { enabled: true, autoSignIn: true },

  user:         { modelName: 'ma_user' },
  session:      { modelName: 'ma_session' },
  account:      { modelName: 'ma_account' },
  verification: { modelName: 'ma_verification' },

  plugins: [
    apiKey({
      apiKeyHeaders: 'x-api-key',
      requireName: true,
      enableSessionForAPIKeys: true,
      rateLimit: { enabled: false },
      schema: { apikey: { modelName: 'ma_apikey' } },
    }) as never,

    // Admin plugin — adds the `role` field to ma_user AND, crucially,
    // attaches it to the session so `currentAdmin.role` is populated.
    // Without this plugin role-based gating silently breaks:
    // `ma_user.role` exists in the DB but the session never carries
    // it, so every role-gated action returns 403. See "Common
    // mistakes" below.
    admin({ defaultRole: process.env.DEMO_ADMIN_ROLE ?? 'user' }) as never,
  ],
})

;(globalThis as { __betterAuth?: unknown }).__betterAuth = auth
```

### 3. Mount Better Auth routes in NestJS

Better Auth manages its own HTTP routes (`/api/auth/*`). Mount them alongside your
NestJS app so the browser can reach sign-in, sign-up, and OAuth callback endpoints:

```ts
// src/main.ts
import { auth } from './auth.js'
import { toNodeHandler } from 'better-auth/node'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // Mount Better Auth's HTTP handler BEFORE NestJS routes.
  // All /api/auth/* requests are handled by Better Auth directly.
  app.use('/api/auth', toNodeHandler(auth))

  await app.listen(process.env.API_PORT ?? 3001)
}
```

### 4. Wire BetterAuthProvider into the admin module

```ts
// src/admin.module.ts
import { Module } from '@nestjs/common'
import { ModernAdminModule } from '@modern-admin/nest'
import { BetterAuthProvider } from '@modern-admin/auth-better-auth'
import type { IAuthProvider } from '@modern-admin/core'

// Read the auth instance published during auth.ts evaluation.
const auth = (globalThis as { __betterAuth?: unknown }).__betterAuth
const authProvider = auth
  ? new BetterAuthProvider({ auth: auth as never })
  : undefined

@Module({
  imports: [
    ModernAdminModule.forRoot({
      // …adapters, databases, plugins…
      ...(authProvider ? { auth: authProvider as IAuthProvider } : {}),
    }),
  ],
})
export class AdminModule {}
```

Set `BETTER_AUTH_ENABLED=false` to bypass the provider entirely during local development
(every request is treated as anonymous).

---

## Database tables

All tables created by Better Auth use the `ma_` prefix to group them visually
alongside the framework's own tables:

| Logical name | Physical table | Contents |
|---|---|---|
| `ma_user` | `ma_user` | Admin user accounts |
| `ma_session` | `ma_session` | Session tokens |
| `ma_account` | `ma_account` | OAuth account links |
| `ma_verification` | `ma_verification` | Email / phone verification tokens |
| `ma_apikey` | `ma_apikey` | API key records (api-key plugin) |

### Migrations

**bun:sqlite**: Better Auth ships a built-in migration runner:

```ts
import { getMigrations } from 'better-auth/db/migration'

const { runMigrations } = await getMigrations(config)
await runMigrations()   // idempotent — safe to call on every boot
```

**Prisma**: add Better Auth's model definitions to `schema.prisma` and run
`prisma migrate dev`. The `prismaAdapter` reads your existing client — no separate
migration step is needed.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `AUTH_BASE_URL` | `http://localhost:3001` | Better Auth `baseURL` — must match the API's public URL |
| `WEB_ORIGIN` | `http://localhost:3000,http://localhost:5173` | Comma-separated list of trusted frontend origins |
| `AUTH_DB_PATH` | `:memory:` | Path to the SQLite file (bun:sqlite only) |
| `GITHUB_CLIENT_ID` | — | GitHub OAuth App client ID (activates GitHub login) |
| `GITHUB_CLIENT_SECRET` | — | GitHub OAuth App client secret |
| `BETTER_AUTH_ENABLED` | `true` | Set to `false` to disable auth entirely |
| `DEMO_ADMIN_EMAIL` | `admin@example.com` | Email for the seed demo admin |
| `DEMO_ADMIN_PASSWORD` | `admin12345` | Password for the seed demo admin |
| `DEMO_ADMIN_NAME` | `Demo Admin` | Display name for the seed demo admin |
| `DEMO_ADMIN_ROLE` | `user` | Role assigned to newly signed-up users via the admin plugin |

---

## Optional plugins

### GitHub OAuth

Activates automatically when both environment variables are set:

```ts
// Automatic — no code change required:
socialProviders: process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
  ? {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      },
    }
  : {}
```

The `getUiProps()` method surfaces the list of enabled providers to the frontend, which
renders the corresponding OAuth buttons on the login page automatically.

### Passkeys

Add the passkey plugin when present (it is an optional peer dependency):

```ts
import { passkey } from 'better-auth/plugins/passkey'

plugins: [
  apiKey({ /* … */ }),
  passkey(),
]
```

The reference app loads it lazily and silently skips it when `better-auth/plugins/passkey`
is not installed.

---

## API key authentication

The `@better-auth/api-key` plugin enables machine-to-machine access via
`x-api-key: <token>` headers. This powers the **Settings → API Keys** page in the admin UI.

### How API key auth flows

1. The client sends `x-api-key: sk_…` in the request header.
2. Better Auth (`enableSessionForAPIKeys: true`) synthesises a session for the key owner.
3. `BetterAuthProvider.getCurrentUser()` detects the header, calls `auth.api.verifyApiKey`,
   and attaches the result as `currentAdmin.apiKey.permissions`.
4. `ModernAdmin.invoke()` checks `apiKey.permissions` against the requested resource×action.

### Permission matrix format

API key permissions use the same format as role permissions:

```json
{
  "users":    ["list", "show"],
  "orders":   ["list", "show", "edit"],
  "*":        ["list"]
}
```

- Keys are **resource ids** (`'*'` matches all resources).
- Values are **action name arrays** (`'*'` matches all actions on that resource).

Keys are created via `POST /admin/api/api-keys` with a `permissions` body. Only
session-authenticated principals can manage keys — an API key cannot create or modify
other keys.

### Managing keys via the API

```http
# List current user's keys
GET /admin/api/api-keys
Cookie: session=…

# Create a key
POST /admin/api/api-keys
Content-Type: application/json
Cookie: session=…

{
  "name": "CI deploy key",
  "expiresInDays": 90,
  "permissions": { "deployments": ["create"], "*": ["list"] }
}

# Update
PATCH /admin/api/api-keys/:id

# Delete
DELETE /admin/api/api-keys/:id
```

The `key` field (the plaintext secret) is returned **only** in the create response.

---

## Roles and permissions

Modern Admin supports role-based access control via the `rolesResourceId` option. When
configured, `invoke()` looks up the current user's `role` in the designated resource
and enforces the stored permission matrix before every action.

### Setup

```ts
ModernAdminModule.forRoot({
  // …
  rolesResourceId: 'roles',   // resource id whose rows hold permission matrices
})
```

> **Prerequisite — Better Auth `admin()` plugin.** `currentAdmin.role`
> is set by `BetterAuthProvider.getCurrentUser()` from
> `session.user.role`, which is populated **only** by Better Auth's
> `admin()` plugin (`better-auth/plugins`). Mount it alongside `apiKey`
> in `src/auth.ts` or every role-gated action will return 403 with
> the principal's role appearing as `undefined`. See "Common
> mistakes" at the bottom of this page.

The roles resource must expose at least:
- `id` — primary key (the role name, e.g. `'admin'`, `'viewer'`)
- `permissions` — a JSON column holding a `Record<resourceId, action[]>` matrix

### Permission matrix format

Same format as API key permissions:

```json
{
  "customers": ["list", "show", "edit", "new", "delete"],
  "orders":    ["list", "show"],
  "*":         ["list", "show"]
}
```

The wildcard `'*'` as a resource key matches every resource; `'*'` as an action matches
every action on that resource.

### Built-in roles (reference apps)

| Role | Access |
|------|--------|
| `admin` | `{ "*": ["*"] }` — full unrestricted access |
| `viewer` | `{ "*": ["list", "show"] }` — read-only access to all resources |
| `editor` | Custom per-resource grants |

Role rows are seeded by the reference apps in `seed-demo.ts`. Adjust the permission
matrix in the `roles` resource via the admin UI — changes take effect on the next
request (the permission cache is invalidated when the roles resource is mutated).

### Role cache

Resolved permissions are cached in-process (keyed by role name). The cache is cleared
automatically when a record in `rolesResourceId` is created, updated, or deleted via
`invoke()`. If you mutate the role table directly (e.g. via a script), call:

```ts
admin.invalidateRolePermissionsCache('viewer')  // clear one role
admin.invalidateRolePermissionsCache()           // clear all
```

---

## Per-action access control

Use `isAccessible` on individual actions for fine-grained control beyond the role matrix:

```ts
import { ResourceDecorator } from '@modern-admin/core'

@AdminResource({
  actions: {
    delete: {
      // Only admins can delete — enforced server-side in invoke()
      isAccessible: ({ currentAdmin }) => currentAdmin?.role === 'admin',
    },
    new: {
      // Show the "Create" button only when the user has a specific permission
      isAccessible: ({ currentAdmin }) =>
        currentAdmin?.apiKey?.permissions?.['users']?.includes('new') ?? false,
    },
  },
})
export class UsersResource {}
```

`isAccessible` runs **before** the action handler. Returning `false` causes `invoke()` to
throw a `ForbiddenError` (mapped to HTTP 403 / GraphQL `FORBIDDEN`).

`isVisible` is a UI-only hint that controls whether an action appears in the interface;
it does not affect server-side enforcement.

---

## Anonymous mode

If no `auth` option is provided, `ModernAdmin` uses `AnonymousAuthProvider` which
returns `null` from `getCurrentUser`. In this mode:

- All routes are **public** — no login is required.
- `currentAdmin` is `undefined` in every action context.
- `isAccessible` predicates that depend on `currentAdmin` should handle `undefined`.

This is suitable for local development, internal tools on private networks, or when you
manage authentication at the infrastructure level (VPN, reverse proxy).

---

## Seeding a demo admin

```ts
import { getMigrations } from 'better-auth/db/migration'

// 1. Run migrations (bun:sqlite only — Prisma uses prisma migrate)
const { runMigrations } = await getMigrations(authConfig)
await runMigrations()

// 2. Sign up the demo user (idempotent — safe to call on every boot)
await auth.api.signUpEmail({
  body: {
    email: process.env.DEMO_ADMIN_EMAIL ?? 'admin@example.com',
    password: process.env.DEMO_ADMIN_PASSWORD ?? 'admin12345',
    name: process.env.DEMO_ADMIN_NAME ?? 'Demo Admin',
  },
})
```

When the `admin` plugin is mounted with `defaultRole: 'admin'`, the seeded user
automatically receives the admin role on sign-up.

---

## Auth endpoints exposed by NestJS

The `@modern-admin/nest` module mounts two auth endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/api/auth/me` | Returns `{ user: CurrentAdmin, permissions: RolePermissions \| null }` for the current session |
| `GET` | `/admin/api/auth/ui-props` | Returns public UI metadata: enabled providers, email/password flag |

The frontend calls `/admin/api/auth/me` on boot. A `401` response triggers the login
screen; a `200` response with `{ user }` transitions directly into the admin shell.

---

## Common mistakes

### Forgetting the `admin()` plugin → 403 on every role-gated action

**Symptom.** A user whose `ma_user.role` reads `'admin'` in the
database (visible in the panel under **Admins**) still gets
`403 Forbidden` on every action that requires a role.

**Root cause.** `BetterAuthProvider.getCurrentUser()` reads
`currentAdmin.role` from `session.user.role`. That field is populated
**only** when Better Auth's `admin()` plugin is mounted. Without
it the session payload has no `role`, the gate sees
`currentAdmin.role === undefined`, and every `isAccessible:
({currentAdmin}) => currentAdmin?.role === 'admin'` predicate
evaluates to `false`.

The trap is that `ma_user.role` *does* contain `'admin'` in the
database. Direct DB writes (e.g.
`prisma.maUser.update({ data: { role: 'admin' }})`) and the
`admins` resource UI bypass the plugin and store/read the column
directly, so the value is visible — but the session, which is built
through Better Auth's API, never sees it.

**Fix.** Mount the admin plugin alongside `apiKey`:

```ts
import { admin } from 'better-auth/plugins'

export const auth = betterAuth({
  // …
  plugins: [
    apiKey({ /* … */ }),
    admin({ defaultRole: process.env.DEMO_ADMIN_ROLE ?? 'user' }),
  ],
})
```

After adding the plugin, sign out and back in so the session is
re-issued with the `role` claim.

**How to verify.** `GET /admin/api/auth/me` should return
`{"user":{"role":"admin", …}, "permissions": { … }}`. If `user.role`
is missing or `permissions` is `null` despite `rolesResourceId` being
configured, the `admin()` plugin is still not mounted.
