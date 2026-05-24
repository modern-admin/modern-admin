// Better Auth instance for the Prisma + Postgres reference app.
//
// The flavour-specific bit is the database slot: instead of a free-standing
// SQLite handle, we hand Better Auth a `prismaAdapter` pointed at the
// host's PrismaClient. All auth tables (`user`, `session`, `account`,
// `apikey`) live in the same Postgres database the rest of the app uses
// — one connection pool, one migration history, one source of truth.
//
// All shared bits (api-key plugin, social providers, baseURL/trustedOrigins,
// email-and-password, globalThis publishing) come from `@modern-admin/app-shared`.

import { prismaAdapter } from 'better-auth/adapters/prisma'
import { buildBetterAuth, seedDemoUser as runSeedDemoUser } from '@modern-admin/app-shared'
import { prisma } from './db.js'
import { admin } from 'better-auth/plugins'
import { type BetterAuthPlugin } from 'better-auth'

const built = buildBetterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  modelNames: {
    user: 'MaUser',
    session: 'MaSession',
    account: 'MaAccount',
    verification: 'MaVerification',
    apikey: 'MaApiKey',
  },
  extraPlugins: [
    admin({
      defaultRole: process.env.DEMO_ADMIN_ROLE ?? 'admin',
    }) as unknown as BetterAuthPlugin,
  ],
})

export const auth = built.auth

/** Seed the reference demo admin so the login screen has known credentials. */
export const seedDemoUser = (): Promise<void> =>
  runSeedDemoUser({ auth: built.auth, label: 'modern-admin/api-prisma' })
