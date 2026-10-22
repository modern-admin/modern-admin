import { createHash } from 'node:crypto'
import type { BetterAuthPlugin } from 'better-auth'
import { z } from 'zod'
import {
  createAuthMiddleware,
  getAuthoritativeSessionFromCtx,
  getOAuthState,
} from 'better-auth/api'

const RECEIPT_TTL_SECONDS = 60
const receiptSchema = z.strictObject({
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  sessionId: z.string().min(1),
  location: z.url(),
  expiresAt: z.number().int().positive(),
})

const fingerprint = (provider: unknown, query?: Record<string, unknown>) => {
  if (
    typeof provider !== 'string' ||
    typeof query?.code !== 'string' ||
    typeof query.state !== 'string' ||
    query.error
  ) {
    return undefined
  }
  return createHash('sha256')
    .update(JSON.stringify([provider, query.code, query.state]))
    .digest('hex')
}

/**
 * Make completed web OAuth callbacks safe to revisit for one minute.
 * Recovery requires an exact provider/code/state match and the same live
 * server-side session. The normal state checks still gate every new login.
 */
export const oauthCallbackReplayPlugin = (): BetterAuthPlugin => ({
  id: 'modern-admin-oauth-callback-replay',
  hooks: {
    before: [
      {
        matcher: (ctx) => ctx.path?.startsWith('/callback/') === true,
        handler: createAuthMiddleware(async (ctx) => {
          ctx.setHeader('cache-control', 'no-store')
          if (ctx.method !== 'GET') return
          const digest = fingerprint(ctx.params?.id, ctx.query)
          if (!digest) return

          const cookie = ctx.context.createAuthCookie('oauth_callback_result', {
            maxAge: RECEIPT_TTL_SECONDS,
          })
          const signed = await ctx.getSignedCookie(cookie.name, ctx.context.secret)
          if (!signed) return

          let receipt: z.infer<typeof receiptSchema>
          try {
            const parsed = receiptSchema.safeParse(JSON.parse(signed))
            if (!parsed.success) return
            receipt = parsed.data
          } catch {
            return
          }
          if (
            receipt.digest !== digest ||
            receipt.expiresAt <= Date.now() ||
            !ctx.context.isTrustedOrigin(receipt.location)
          )
            return

          const current = await getAuthoritativeSessionFromCtx(ctx)
          if (!current || current.session.id !== receipt.sessionId) return

          throw ctx.redirect(receipt.location)
        }),
      },
    ],
    after: [
      {
        matcher: (ctx) => ctx.path?.startsWith('/callback/') === true,
        handler: createAuthMiddleware(async (ctx) => {
          const digest = fingerprint(ctx.params?.id, ctx.query)
          const session = ctx.context.newSession
          const location = ctx.context.responseHeaders?.get('location')
          const state = await getOAuthState()
          if (!digest || !session || !location || !state) return
          if (location !== state.callbackURL && location !== state.newUserURL) {
            return
          }

          // Native deep links may contain session credentials: never copy them.
          if (!/^https?:\/\//.test(location)) return
          if (!ctx.context.isTrustedOrigin(location)) return

          const cookie = ctx.context.createAuthCookie('oauth_callback_result', {
            maxAge: RECEIPT_TTL_SECONDS,
          })
          await ctx.setSignedCookie(
            cookie.name,
            JSON.stringify({
              digest,
              sessionId: session.session.id,
              location,
              expiresAt: Date.now() + RECEIPT_TTL_SECONDS * 1000,
            }),
            ctx.context.secret,
            cookie.attributes,
          )
        }),
      },
    ],
  },
})
