# {{name}}

Standalone Modern Admin panel — a NestJS service that talks to the same
Postgres database as your main backend, but ships independently. The
prebuilt React SPA is served at `/admin` from the same process; no
separate frontend deployment is required.

## What's wired out of the box

- **Prisma 7 + Postgres** via `@modern-admin/adapter-prisma` and the
  `@prisma/adapter-pg` driver adapter.
- **Better Auth** (email/password + API keys) via `@modern-admin/auth-better-auth`.
- **Static SPA** at `/admin` via `@modern-admin/web`.
- **Optional Redis cache** for cross-instance invalidation.
- Empty resource list — add your own (see _Adding resources_ below).

## Prerequisites

- Bun ≥ 1.3
- Docker (optional, for local Postgres+Redis via `docker compose`)

The `@modern-admin/*` packages are published publicly on npm, so no
registry token is needed to install them.

## Setup

```sh
# 1. Provide secrets
cp .env.example .env
# Edit .env: generate a BETTER_AUTH_SECRET with `bun run auth:secret`,
# point DATABASE_URL at your database.

# 2. Boot the dev database (optional — skip if you have your own)
docker compose up -d

# 3. Install packages
bun install

# 4. Generate Prisma client and apply migrations
bun run db:generate
bun run db:migrate

# 5. Run
bun run dev
```

The admin panel is now live at **http://localhost:3001/admin**.

## First-run admin user

The schema seeds zero users. Create one via a quick script. It uses Better
Auth's password hasher and an atomic upsert keyed by the complete Better Auth
1.7 credential identity, so concurrent executions still produce one user and
one credential account:

```ts
// prisma/seed.ts
import { PrismaPg } from '@prisma/adapter-pg'
import { isCredentialAccountIdentity } from '@modern-admin/auth-better-auth'
import { uuidv7 } from '@modern-admin/core'
import { hashPassword } from 'better-auth/crypto'
import { PrismaClient } from '../src/generated/prisma/client.js'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})
const password = await hashPassword('admin12345')

await prisma.$transaction(async (tx) => {
  await tx.maRole.upsert({
    where: { id: 'admin' },
    update: {},
    create: { id: 'admin', permissions: { '*': ['*'] }, isBuiltin: true },
  })
  const user = await tx.maUser.upsert({
    where: { email: 'admin@example.com' },
    update: { role: 'admin' },
    create: {
      id: uuidv7(),
      name: 'Admin',
      email: 'admin@example.com',
      emailVerified: true,
      role: 'admin',
    },
  })
  const account = await tx.maAccount.upsert({
    where: {
      issuer_accountId: {
        issuer: 'local:credential',
        accountId: user.id,
      },
    },
    update: {},
    create: {
      id: uuidv7(),
      userId: user.id,
      providerId: 'credential',
      issuer: 'local:credential',
      accountId: user.id,
      password,
    },
  })
  if (!isCredentialAccountIdentity(account, user.id) || account.userId !== user.id) {
    throw new Error('Credential identity is already linked to a different account')
  }
})
```

Run with `bun run prisma/seed.ts`.

## Upgrading Better Auth 1.6 to 1.7

This scaffold targets Better Auth 1.7 and its `(issuer, accountId)` account
identity contract; its schema is not compatible with the old 1.6 account
shape. For a populated installation, stop authentication writers and run the
transactional PostgreSQL migration shipped at
`@modern-admin/system-prisma/prisma/migrations/better-auth-1.7-account-identities.sql`
before deploying Better Auth 1.7.

The migration inventories providers, maps credentials to `local:credential`,
preserves Google's authoritative `https://accounts.google.com` issuer, and
fails on unknown providers or identity collisions. Review and extend its
explicit provider mapping for your deployment; never derive a trusted issuer
from email, profile/display data, request input, or an unverified endpoint.
Do not merge or delete colliding users automatically.

## Adding resources

1. Add the model to `prisma/schema.prisma` (or `prisma db pull` from
   your live database) and re-run `bun run db:migrate`.
2. Create `src/resources/<name>.resource.ts`:

   ```ts
   import { Module } from '@nestjs/common'
   import { AdminResource } from '@modern-admin/nest'
   import type { PrismaResourceConfig } from '@modern-admin/adapter-prisma'
   import { dmmf, prisma } from '../db.js'

   const prismaSource =
     (modelName: string): (() => PrismaResourceConfig) =>
     () => {
       const model = dmmf.datamodel.models.find((m) => m.name === modelName)
       if (!model) throw new Error(`[admin] Prisma model "${modelName}" not found`)
       const lowerFirst = (s: string): string =>
         s.length === 0 ? s : s.charAt(0).toLowerCase() + s.slice(1)
       return {
         model,
         client: prisma,
         clientKey: lowerFirst(modelName),
         enums: dmmf.datamodel.enums,
       }
     }

   @AdminResource({
     source: prismaSource('Product'),
     navigation: { icon: 'Package', group: 'Catalog' },
     listProperties: ['name', 'price', 'stock', 'updatedAt'],
   })
   export class ProductResource {}

   @Module({ controllers: [ProductResource] })
   export class ProductsAdminModule {}
   ```

3. Import the new `…AdminModule` in `src/admin.module.ts`:

   ```ts
   import { ProductsAdminModule } from './resources/product.resource.js'

   @Module({
     imports: [ModernAdminModule.forRoot({/* … */}), ProductsAdminModule],
   })
   export class AdminModule {}
   ```

## Deploying

The service is stateless and horizontally scalable. Typical setup:

- One or more replicas behind a load balancer (e.g. fly.io, Render,
  Railway, Kubernetes Deployment).
- Set `REDIS_URL` so all replicas see cache invalidation events.
- Mount `/admin` behind your main domain via a path-prefix proxy
  (e.g. `mycompany.com/admin → admin-service`).
- Run database migrations from CI (`bun run db:deploy`, which calls
  `prisma migrate deploy`) before cutting traffic.

## Learn more

- [Modern Admin docs](https://github.com/modern-admin/modern-admin/tree/main/docs)
- [Resource decorator reference](https://github.com/modern-admin/modern-admin/blob/main/docs/decorators.md)
- [Better Auth](https://www.better-auth.com/docs)
