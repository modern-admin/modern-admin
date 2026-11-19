import type { BetterAuthPlugin } from 'better-auth'
import { genericOAuth } from 'better-auth/plugins/generic-oauth'
import { z } from 'zod'

const secureUrl = z.url().refine((value) => {
  const url = new URL(value)
  return url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.search
}, 'SSO URLs must use HTTPS without credentials, query parameters or fragments')

const providerSchema = z.object({
  providerId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().trim().min(1),
  issuer: secureUrl,
  discoveryUrl: secureUrl.optional(),
  clientId: z.string().trim().min(1),
  clientSecret: z.string().min(1),
  scopes: z.array(z.string().min(1)).optional(),
  allowSignUp: z.boolean().default(false),
  disableProviderLogout: z.boolean().default(false),
})

export type OidcSsoProvider = z.input<typeof providerSchema>

interface OidcProviderMetadata {
  providerId: string
  name: string
  issuer: string
}

/** Server-side metadata shared with the identity plugin and public UI projection. */
export function getOidcSsoProviders(plugins: readonly unknown[] = []): OidcProviderMetadata[] {
  return plugins.flatMap((plugin) => {
    const candidate = plugin as {
      id?: string
      options?: { modernAdminOidcProviders?: OidcProviderMetadata[] }
    } | null
    return candidate?.id === 'generic-oauth'
      ? (candidate.options?.modernAdminOidcProviders ?? [])
      : []
  })
}

/** OIDC login through Better Auth's standard social sign-in and callback routes. */
export function oidcSsoPlugin(options: { providers: OidcSsoProvider[] }): BetterAuthPlugin {
  const providers = z.array(providerSchema).min(1).parse(options.providers)
  const ids = new Set<string>()
  for (const provider of providers) {
    if (
      ids.has(provider.providerId) ||
      ['credential', 'google', 'github', 'apple'].includes(provider.providerId)
    ) {
      throw new Error(`Duplicate or reserved SSO provider id: ${provider.providerId}`)
    }
    ids.add(provider.providerId)
  }

  const plugin = genericOAuth({
    config: providers.map((provider) => ({
      providerId: provider.providerId,
      name: provider.name,
      discoveryUrl:
        provider.discoveryUrl ??
        `${provider.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`,
      clientId: provider.clientId,
      clientSecret: provider.clientSecret,
      scopes: [...new Set(['openid', 'email', 'profile', ...(provider.scopes ?? [])])],
      pkce: true,
      requireIdTokenVerification: true,
      disableSignUp: !provider.allowSignUp,
      disableProviderLogout: provider.disableProviderLogout,
      // OIDC identity always uses the immutable subject, never the email or name.
      accountSubject: ({ profile }) => (typeof profile.sub === 'string' ? profile.sub : ''),
    })),
  })

  return {
    ...plugin,
    options: {
      ...plugin.options,
      modernAdminOidcProviders: providers.map(({ providerId, name, issuer }) => ({
        providerId,
        name,
        issuer,
      })),
    },
    init: async (ctx) => {
      for (const provider of providers) {
        if (ctx.socialProviders.some(({ id }) => id === provider.providerId)) {
          throw new Error(`SSO provider shadows another provider: ${provider.providerId}`)
        }
      }
      const result = await plugin.init(ctx)
      for (const config of providers) {
        const provider = result.context.socialProviders.find(({ id }) => id === config.providerId)
        // Fail closed on unavailable discovery, missing JWKS or an unexpected issuer.
        if (!provider?.idToken || provider.issuer !== config.issuer) {
          throw new Error(`SSO discovery failed or issuer mismatch: ${config.providerId}`)
        }
        const validateIdentity = async (info: Awaited<ReturnType<typeof provider.getUserInfo>>) => {
          const subject = (info?.data as { sub?: unknown } | undefined)?.sub
          if (
            !info ||
            info.user.emailVerified !== true ||
            typeof subject !== 'string' ||
            !subject
          ) {
            return null
          }
          // Better Auth looks accounts up by providerId/subject. Prevent reusing
          // a provider id with a different issuer from taking over old bindings.
          const existing = await ctx.internalAdapter.findAccountByKey({
            providerId: config.providerId,
            accountId: subject,
          })
          if (existing && (existing as { issuer?: unknown }).issuer !== config.issuer) return null
          return info
        }
        const getUserInfo = provider.getUserInfo.bind(provider)
        provider.getUserInfo = async (tokens) => {
          if (!tokens.idToken) return null
          return validateIdentity(await getUserInfo(tokens))
        }
        const fromIdToken = provider.getUserInfoFromIdToken?.bind(provider)
        if (fromIdToken) {
          provider.getUserInfoFromIdToken = async (token) => {
            return validateIdentity(await fromIdToken(token))
          }
        }
      }
      return result
    },
  }
}
