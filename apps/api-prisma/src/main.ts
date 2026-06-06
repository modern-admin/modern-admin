// Prisma + Postgres flavoured bootstrap.
//
// Highlights:
//
//   - No `migrateAuth()` call: Prisma migrations are managed externally
//     via `bun run prisma:migrate` (dev) / `prisma:deploy` (prod). The
//     same migration history covers both Better Auth tables and the
//     Modern Admin Ma* tables (they live in one `schema.prisma`).
//   - The PrismaClient is instantiated once in `db.ts` and shared by
//     Better Auth, the Modern Admin Prisma adapter, and the system
//     stores — one connection pool, one source of truth.
//   - Idempotent demo seed runs when `SEED_DEMO=1` (Playwright e2e
//     boots the app with that flag set).

import { bootstrapApp } from '@modern-admin/app-shared'
import { auth, seedDemoUser } from './auth.js'
import { AppModule } from './app.module.js'
import { seedDemoIfEnabled } from './seed-demo.js'

void bootstrapApp({
  AppModule,
  auth,
  label: 'modern-admin/api-prisma',
  preBootstrap: async () => {
    await seedDemoUser()
    await seedDemoIfEnabled()
  },
  openApi: {
    title: 'Modern Admin — Prisma Reference API',
    description:
      'REST surface of the @modern-admin/nest module backed by Prisma + Postgres. ' +
      'Authentication is cookie-based via Better Auth (`/api/auth/sign-in/email`).',
    version: '0.0.0',
    cookie: { description: 'Better Auth session cookie set on `/api/auth/sign-in/*`.' },
    bearer: { description: 'Modern Admin API key (Authorization: Bearer …)' },
    scalar: { theme: 'default', pageTitle: 'Modern Admin API (Prisma)' },
  },
})
