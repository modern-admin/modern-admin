/**
 * Better Auth setup for {{name}}.
 *
 * Email-and-password sign-in is enabled by default — the bundled
 * `@modern-admin/web` SPA renders a matching login form. To add OAuth
 * providers, passkeys, or 2FA see https://www.better-auth.com/docs.
 */
import { betterAuth } from 'better-auth'
import { apiKey } from '@better-auth/api-key'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from './db.js'

const port = Number(process.env.PORT ?? 3001)
const baseURL = process.env.BETTER_AUTH_URL ?? `http://localhost:${port}`

export const auth = betterAuth({
  baseURL,
  basePath: '/admin/api/auth',
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  // Map Better Auth's logical tables onto our Prisma model names. The
  // `@@map("ma_user")` directives in schema.prisma take care of the
  // physical table names. Better Auth's prismaAdapter resolves these
  // strings against the Prisma client's delegate keys, not the
  // underlying tables — so PascalCase (Prisma model names) is correct.
  user: { modelName: 'MaUser' },
  session: { modelName: 'MaSession' },
  account: { modelName: 'MaAccount' },
  verification: { modelName: 'MaVerification' },
  emailAndPassword: { enabled: true },
  trustedOrigins: process.env.WEB_ORIGIN?.split(',') ?? [],
  plugins: [
    apiKey({
      apiKeyHeaders: 'x-api-key',
      requireName: true,
      enableSessionForAPIKeys: true,
      rateLimit: { enabled: false },
      schema: { apikey: { modelName: 'MaApiKey' } },
    }),
  ],
})
