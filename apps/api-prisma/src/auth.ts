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

const built = buildBetterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: process.env.SSO_ONLY !== 'true',
  oidcSsoProviders: process.env.SSO_ISSUER
    ? [
        {
          providerId: process.env.SSO_PROVIDER_ID ?? 'authentik',
          name: process.env.SSO_PROVIDER_NAME ?? 'authentik',
          issuer: process.env.SSO_ISSUER,
          discoveryUrl: process.env.SSO_DISCOVERY_URL,
          clientId: process.env.SSO_CLIENT_ID ?? '',
          clientSecret: process.env.SSO_CLIENT_SECRET ?? '',
        },
      ]
    : [],
  modelNames: {
    user: 'maUser',
    session: 'maSession',
    account: 'maAccount',
    verification: 'maVerification',
    apikey: 'maApiKey',
  },
  extraPlugins: [
    admin({
      defaultRole: process.env.DEMO_ADMIN_ROLE ?? 'admin',
    }),
  ],
})

export const auth = built.auth

/** Seed the reference demo admin so the login screen has known credentials. */
export const seedDemoUser = (): Promise<void> =>
  runSeedDemoUser({ auth: built.auth, label: 'modern-admin/api-prisma' })
