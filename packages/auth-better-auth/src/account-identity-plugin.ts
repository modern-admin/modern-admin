import type { BetterAuthPlugin } from 'better-auth'
import { resolveAccountIssuer, type AccountIssuerPolicy } from './account-identities.js'
import { getOidcSsoProviders } from './oidc-sso.js'

/** Preserve Modern Admin's issuer column after Better Auth 1.7.3 removed it. */
export const accountIdentityPlugin = (policy: AccountIssuerPolicy = {}): BetterAuthPlugin => ({
  id: 'modern-admin-account-identity',
  schema: {
    account: {
      fields: { issuer: { type: 'string', required: true, input: false } },
      indexes: [{ fields: ['issuer', 'accountId'], unique: true }],
    },
  },
  init: (ctx) => ({
    options: {
      databaseHooks: {
        account: {
          create: {
            before: async (account) => ({
              data: {
                ...account,
                issuer: resolveAccountIssuer(account.providerId, {
                  ...policy,
                  authoritativeIssuers: {
                    ...policy.authoritativeIssuers,
                    ...Object.fromEntries(
                      getOidcSsoProviders(ctx.options.plugins).map(({ providerId, issuer }) => [
                        providerId,
                        issuer,
                      ]),
                    ),
                  },
                }),
              },
            }),
          },
        },
      },
    },
  }),
})
