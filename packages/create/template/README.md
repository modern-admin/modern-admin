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
- Empty resource list — add your own (see *Adding resources* below).

## Prerequisites

- Bun ≥ 1.3
- Docker (optional, for local Postgres+Redis via `docker compose`)
- A GitHub Packages **read token** (because `@modern-admin/*` is published
  to a private registry). Create at https://github.com/settings/tokens
  with the `read:packages` scope.

## Setup

```sh
# 1. Provide secrets
cp .env.example .env
# Edit .env: set MODERN_ADMIN_TOKEN (your GitHub PAT), generate a
# BETTER_AUTH_SECRET with `bun run auth:secret`, point DATABASE_URL at
# your database.

# 2. Boot the dev database (optional — skip if you have your own)
docker compose up -d

# 3. Install packages (uses .npmrc + $MODERN_ADMIN_TOKEN for the registry)
export MODERN_ADMIN_TOKEN=$(grep MODERN_ADMIN_TOKEN .env | cut -d= -f2)
bun install

# 4. Generate Prisma client and apply migrations
bun run db:generate
bun run db:migrate

# 5. Run
bun run dev
```

The admin panel is now live at **http://localhost:3001/admin**.

## First-run admin user

The schema seeds zero users. Create one via a quick script — Better Auth
hashes the password and Modern Admin reads the role:

```ts
// prisma/seed.ts
import { PrismaPg } from '@prisma/adapter-pg'
import { uuidv7 } from '@modern-admin/core'
import { PrismaClient } from '../src/generated/prisma/client.js'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})
const password = await Bun.password.hash('admin12345', 'argon2id')

const user = await prisma.maUser.create({
  data: {
    id: uuidv7(),
    name: 'Admin',
    email: 'admin@example.com',
    emailVerified: true,
    role: 'admin',
  },
})
await prisma.maAccount.create({
  data: {
    id: uuidv7(),
    userId: user.id,
    providerId: 'credential',
    accountId: user.id,
    password,
  },
})
await prisma.maRole.upsert({
  where: { id: 'admin' },
  update: {},
  create: { id: 'admin', permissions: { '*': ['*'] }, isBuiltin: true },
})
```

Run with `bun run prisma/seed.ts`.

## Adding resources

1. Add the model to `prisma/schema.prisma` (or `prisma db pull` from
   your live database) and re-run `bun run db:migrate`.
2. Create `src/resources/<name>.resource.ts`:

   ```ts
   import { Module } from '@nestjs/common'
   import { AdminResource } from '@modern-admin/nest'
   import type { PrismaResourceConfig } from '@modern-admin/adapter-prisma'
   import { dmmf, prisma } from '../db.js'

   const prismaSource = (modelName: string): (() => PrismaResourceConfig) => () => {
     const model = dmmf.datamodel.models.find((m) => m.name === modelName)
     if (!model) throw new Error(`[admin] Prisma model "${modelName}" not found`)
     const lowerFirst = (s: string): string =>
       s.length === 0 ? s : s.charAt(0).toLowerCase() + s.slice(1)
     return {
       model: model as never,
       client: prisma as never,
       clientKey: lowerFirst(modelName),
       enums: dmmf.datamodel.enums as never,
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
     imports: [
       ModernAdminModule.forRoot({ /* … */ }),
       ProductsAdminModule,
     ],
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
