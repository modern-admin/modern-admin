---
title: Getting started
description: Scaffold a Modern Admin project and register your first resource.
---

# Getting started

## Prerequisites

- **[Bun] 1.3+** — used as both the package manager and the runtime.
- **Node 20+** is implicitly required by the NestJS 11 dependency tree, but
  Bun's runtime is what actually executes the code.
- **PostgreSQL** (for the Prisma/Drizzle adapters) and optionally **Redis**
  for distributed caching and realtime fan-out.

## Scaffold a new project

```sh
bunx create-modern-admin my-app
cd my-app
bun install
cp .env.example .env
bun run dev
```

The starter wires up a single `AppModule` that imports
`ModernAdminModule.forRoot({ databases: [], resources: [] })`. The API
listens on `http://localhost:3001`.

## Register a resource

Resources are *adapters around a model* — Modern Admin asks the adapter for
properties, records, counts, and mutations. With the Prisma adapter:

```sh
bun add @modern-admin/adapter-prisma @prisma/client
```

```ts
// src/app.module.ts
import { Module } from '@nestjs/common'
import { ModernAdminModule } from '@modern-admin/nest'
import { PrismaDatabase } from '@modern-admin/adapter-prisma'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

@Module({
  imports: [
    ModernAdminModule.forRoot({
      databases: [new PrismaDatabase(prisma)],
      resources: [
        {
          id: 'User',
          options: {
            properties: {
              email: { isTitle: true },
              passwordHash: { isVisible: false },
            },
          },
        },
      ],
    }),
  ],
})
export class AppModule {}
```

Restart `bun run dev` — the `User` resource is now exposed at:

- `GET    /admin/api/resources/User/actions/list` — list
- `GET    /admin/api/resources/User/records/:id/actions/show` — show
- `POST   /admin/api/resources/User/actions/new` — create
- `PATCH  /admin/api/resources/User/records/:id/actions/edit` — update
- `DELETE /admin/api/resources/User/records/:id/actions/delete` — delete
- `GET    /admin/api/resources/User/actions/search?q=…` — search

…and over GraphQL at `/admin/graphql` with `userList`, `userOne`, and
`userCount` queries auto-generated from the same resource definition.

## Add the React frontend

```sh
bun add @modern-admin/react @modern-admin/ui react@19 react-dom@19
```

```tsx
import { ModernAdminProvider, AdminApp } from '@modern-admin/react'
import '@modern-admin/ui/styles.css'

export function App(): React.ReactElement {
  return (
    <ModernAdminProvider apiBaseUrl="/admin/api">
      <AdminApp />
    </ModernAdminProvider>
  )
}
```

`<AdminApp />` provides list, show, edit, and create pages out of the box,
backed by TanStack Query against the REST endpoints.

## Adding auth

Better Auth provides sessions, OAuth, passkeys, and 2FA. Wire it in via the
`auth` option:

```ts
import { BetterAuthProvider } from '@modern-admin/auth-better-auth'

ModernAdminModule.forRoot({
  databases: [...],
  resources: [...],
  auth: new BetterAuthProvider({ /* better-auth config */ }),
})
```

See [Authentication](./auth.md) for the full integration.

[Bun]: https://bun.sh
