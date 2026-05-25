---
title: Admins, Roles & Permissions
description: Panel admins, configurable roles, and the permissions matrix that gates every action.
---

# Admins, Roles & Permissions

Modern Admin ships with a built-in access-control model that has three
moving parts:

1. **Panel admins** — the people who can log into the admin UI. They are
   stored in Better Auth's user table (`ma_user`).
2. **Roles** — a configurable list of named roles (`admin`, `editor`,
   `viewer`, …) that you manage from inside the admin panel.
3. **Permissions** — a `resource × action` matrix attached to each role
   that decides which actions a logged-in admin may invoke.

This document explains how the three pieces connect, how to manage them
from the UI, and how to wire them up in your own host app.

> **TL;DR**
> - Login still flows through Better Auth.
> - The `admins` resource is a CRUD view over `ma_user`.
> - The `roles` resource owns the permissions matrix.
> - `ModernAdmin.invoke()` checks the matrix on every call.
> - The frontend uses the same matrix to hide buttons it can't use.

## Concepts

### Panel admin vs. application user

Before this feature there was a single `users` resource that served two
unrelated jobs — the application's end users *and* the panel's logins.
That overlap caused confusion. We split them:

| Concept              | Where it lives                       | Resource id |
| -------------------- | ------------------------------------ | ----------- |
| Panel admin (login)  | Better Auth (`ma_user`, `ma_account`) | `admins`    |
| Application end user | Your own table (`Customer`, etc.)    | `customers` |

The reference app uses this split — see
`apps/api-prisma/src/admin-sources.ts` and
`apps/api-prisma/prisma/schema.prisma`.

### Better Auth `ma_*` tables

All Better Auth tables are remapped with the `ma_` prefix so they can
share a database with your application schema without naming
collisions:

```
ma_user            -- panel admins (one row per person, regardless of strategy)
ma_account         -- per-strategy credentials linked to ma_user
                      (one row per OAuth provider / passkey / password / …)
ma_session         -- active sessions
ma_verification    -- email-verification & password-reset tokens
ma_role            -- role definitions and permissions matrix
```

#### Login strategies

How an admin actually logs in is **entirely decided by your Better
Auth configuration**, not by Modern Admin. Better Auth supports —
among others — email + password, magic links, OAuth (Google, GitHub,
Microsoft, …), passkeys / WebAuthn, OTP. You enable the ones you want
when you construct the auth instance:

```ts
import { betterAuth } from 'better-auth'
import { passkey } from 'better-auth/plugins/passkey'
import { admin } from 'better-auth/plugins/admin'

export const auth = betterAuth({
  database: { /* … */ },
  emailAndPassword: { enabled: true },        // optional
  socialProviders: {
    google: { clientId, clientSecret },       // optional
    github: { clientId, clientSecret },       // optional
  },
  plugins: [
    passkey(),                                // optional
    admin({ /* … */ }),                       // adds `role`, `banned`, …
  ],
})
```

Whichever strategies you turn on, Better Auth funnels the resulting
identity into a single `ma_user` row (creating new ones on first
sign-in for OAuth/passkey) and stores the strategy-specific credential
in `ma_account`. From Modern Admin's point of view the principal is
always just a `ma_user` row plus a session — the **role** and
**permissions** machinery described below is identical regardless of
how the user authenticated.

> **The `admin()` plugin is mandatory for everything on this page.**
> `ma_user.role` exists as a column only because the `admin` plugin
> declares it, and — more importantly — the plugin is also what
> attaches `role` to the **session**, which is where
> `BetterAuthProvider.getCurrentUser()` reads it from. If you omit
> `admin()` from `plugins: [...]`, the role column may still be
> populated by direct DB writes (the `admins` resource in the panel
> writes it through Prisma), but **the session never carries it** —
> so `currentAdmin.role` is always `undefined`, the role gate fails
> open or denies depending on the action, and every
> `isAccessible: ({currentAdmin}) => currentAdmin?.role === 'admin'`
> predicate evaluates to `false`. The symptom is "the admin user
> from the `Admins` page gets 403 on everything role-gated even
> though their `role` column reads `admin`". Fix: add `admin({...})`
> to `plugins` in `src/auth.ts` and re-issue sessions (sign out / in).
> See [Authentication → Common mistakes](./auth.md#common-mistakes).

There is no `password` column on `ma_user`; password hashes (when
present) live in `ma_account`. That's why the `admins` resource in this
panel does not expose a "set password" field — password resets, if
your config allows them, are issued through Better Auth's own API:

```ts
await auth.api.setUserPassword({ userId, newPassword })
```

Equivalent flows exist for unlinking an OAuth account, registering a
new passkey, etc. — see the Better Auth docs.

### Roles are just a resource

`roles` is a regular Modern Admin resource backed by `ma_role`. Each
row has:

| Column        | Type        | Notes                                                              |
| ------------- | ----------- | ------------------------------------------------------------------ |
| `id`          | string PK   | **Doubles as the user-visible role name.** No separate `name` column. |
| `description` | string      | Free-form, optional.                                               |
| `permissions` | JSON object | The matrix — `{ resourceId: ['action', …] }`.                      |
| `isBuiltin`   | boolean     | `true` for the `admin` and `viewer` roles seeded by the framework. |

#### One column, one identity

Roles deliberately have a single identity column. The string in
`ma_user.role` *is* the role's id, and the role's id *is* what the UI
displays — there's no second `name` column to keep in sync.

A consequence is that **roles cannot be renamed**. Renaming would
orphan every admin holding the role, and Prisma treats `@id` columns as
immutable, so the storage layer enforces this for free. To "rename" a
role:

1. Create a new role with the desired id and the same permissions.
2. Edit each admin to point at the new role.
3. Delete the old role.

Only `description` and `permissions` are editable on an existing row.

#### Builtin roles

Two roles are seeded automatically and cannot be deleted:

- **`admin`** — `{ "*": ["*"] }`. Full access to every action on every
  resource.
- **`viewer`** — `{ "*": ["list", "show", "search"] }`. Read-only.

Their `isBuiltin` flag is `true` and the controller blocks delete /
bulkDelete on them.

## The permissions matrix

A role's `permissions` column is a plain JSON object where each key is
a resource id and each value is an array of allowed action names:

```json
{
  "posts":    ["list", "show", "edit"],
  "comments": ["list", "show", "delete"],
  "products": ["*"]
}
```

### Wildcards

- `"*"` as an **action** allows every action on that resource.
  Example: `{ "posts": ["*"] }` lets the role do anything to `posts`.
- `"*"` as a **resource** allows the listed actions on every resource.
  Example: `{ "*": ["list", "show"] }` is "read-only across the panel".
- Both combined — `{ "*": ["*"] }` — is "superuser".

### Action names

Action names match the action ids registered with the resource. The
built-ins are:

| Group   | Actions                                  |
| ------- | ---------------------------------------- |
| Read    | `list`, `show`, `search`                 |
| Write   | `new`, `edit`                            |
| Delete  | `delete`, `bulkDelete`                   |
| Bulk    | `bulkEdit`, `export`                     |

Custom actions you register via `@Action(...)` participate in the same
matrix — just list their name under the resource you want to grant.

## Server-side enforcement

The matrix is the source of truth. The frontend uses it to hide
buttons, but every request still passes through
`ModernAdmin.invoke()`, which does its own check.

Pseudo-code from `packages/core/src/modern-admin.ts`:

```ts
async invoke(request, currentAdmin) {
  // 1. API-key gate (if the principal carries an api key claim)
  if (!apiKeyAllows(currentAdmin, resourceId, action)) throw new ForbiddenError(...)

  // 2. Role gate (if rolesResourceId is configured)
  if (this.options.rolesResourceId && currentAdmin?.role) {
    const perms = await this.getRolePermissions(currentAdmin.role)
    if (perms && !permissionsAllow(perms, resourceId, action)) {
      throw new ForbiddenError(...)
    }
  }

  // 3. Action's own isAccessible / before hooks
  // 4. Run action handler
}
```

Both gates use the same matching helper (`permissionsAllow`), so
api-key permissions and role permissions share the exact same wildcard
semantics.

### Caching and invalidation

`getRolePermissions(name)` is memoized per role on the `ModernAdmin`
instance. The cache is invalidated automatically whenever the `roles`
resource is mutated — `new`, `edit`, `delete`, or `bulkDelete`. So if
you tighten a role's permissions in the UI, the next request from any
admin holding that role is denied immediately.

If you mutate `ma_role` outside of `invoke()` (e.g. via a raw SQL
migration), call `admin.invalidateRolePermissionsCache()` from your
host code to force a refresh.

### Fail-open semantics

If `rolesResourceId` is not configured, or the principal has no `role`
claim, or the role row simply does not exist, the role gate is a
**no-op** (it doesn't deny the request). Authorization then falls
through to the rest of the pipeline — `isAccessible`, action-level
guards, etc.

This is intentional: it means existing apps that don't use roles
behave exactly as before, and accidentally deleting a role doesn't
lock its holders out of basic auth. Operators who want strict
deny-by-default should ensure every admin's role exists and that
the `admin` role is the only one with `{ "*": ["*"] }`.

## Frontend hint layer

The SPA calls `GET /admin/api/auth/me` after login. The response now
includes the resolved permissions:

```json
{
  "user": {
    "id": "u_…",
    "email": "alice@example.com",
    "role": "editor"
  },
  "permissions": {
    "posts": ["list", "show", "edit"],
    "comments": ["list", "show"]
  }
}
```

The React layer feeds those permissions into the navigation tree and
into per-row action menus, so a user without `delete` on `posts` never
even sees the trash button. **This is a UI hint only** — the request
would still be rejected server-side. Treat the matrix as the trust
boundary, not the rendered button.

## Wiring it up

To enable role-based access control in your own host app:

### 1. Schema

Add the `MaRole` table to your Prisma schema (or equivalent for
Drizzle):

```prisma
model MaRole {
  id          String   @id              // == user-visible role name
  description String?
  permissions Json     @default("{}")
  isBuiltin   Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("ma_role")
}
```

### 2. Seed the builtins

Always seed `admin` and `viewer` so a fresh DB has at least one
superuser:

```ts
await prisma.maRole.upsert({
  where: { id: 'admin' },
  create: { id: 'admin', permissions: { '*': ['*'] }, isBuiltin: true },
  update: { isBuiltin: true },
})
```

Reference: `apps/api-prisma/src/seed-demo.ts`.

### 3. Module wiring

Tell `ModernAdminModule` which resource holds your roles, and import
the bundled controllers:

```ts
import {
  AdminsAdminModule,
  RolesAdminModule,
} from '@modern-admin/app-shared'

@Module({
  imports: [
    ModernAdminModule.forRoot({
      adapters: [/* your adapter */],
      databases: [/* your client */],
      rolesResourceId: 'roles',          // ← turns on the role gate
      auth: betterAuthProvider,
    }),
    AdminsAdminModule,
    RolesAdminModule,
    // … your domain modules
  ],
})
export class AdminModule {}
```

That's it. Log in as the seeded `admin` user, open `/admin/roles` to
edit the matrix, and `/admin/admins` to assign roles to other panel
users.

## Cookbook

### Read-only role for analytics

Create a role called `analyst` with:

```json
{ "*": ["list", "show", "search", "export"] }
```

### Editor for content team

```json
{
  "posts":      ["*"],
  "comments":   ["list", "show", "edit", "delete"],
  "tags":       ["list", "show", "new", "edit"],
  "categories": ["list", "show"]
}
```

### Per-action granular delete

Allow listing and editing posts but never deleting them:

```json
{ "posts": ["list", "show", "new", "edit"] }
```

### Disable bulk operations site-wide for a role

Just omit `bulkEdit` and `bulkDelete` from every entry — the matrix is
allowlist-based, not denylist-based, so anything not listed is denied.

## See also

- [Authentication](./auth.md) — Better Auth integration and the
  `me`/`ui-props` endpoints.
- [Decorators](./decorators.md) — `@AdminResource`, `@Action`,
  `@Before` hooks used by the bundled controllers.
- [Architecture](./architecture.md) — where the role gate sits in the
  `invoke()` pipeline.
