# @modern-admin/auth-better-auth

[![npm version](https://img.shields.io/npm/v/@modern-admin/auth-better-auth)](https://www.npmjs.com/package/@modern-admin/auth-better-auth)
[![license](https://img.shields.io/npm/l/@modern-admin/auth-better-auth)](https://github.com/modern-admin/modern-admin/blob/main/LICENSE)

> Better Auth provider integration for Modern Admin (cookie sessions + API keys).

Part of [**Modern Admin**](https://github.com/modern-admin/modern-admin) — a universal, modern admin panel framework
built on NestJS + React 19, with Prisma/Drizzle adapters, Tailwind 4 UI, and
end-to-end Zod validation.

## Installation

```sh
bun add @modern-admin/auth-better-auth better-auth@1.7.18
```

Use `accountIdentityPlugin()` from this package in the Better Auth `plugins`
array. Better Auth 1.7.3 removed its built-in issuer field; this plugin preserves
Modern Admin’s existing required column and unique index without a destructive
schema migration. Issuers are derived from trusted provider configuration,
never client input. Unknown providers fail closed; pass an `AccountIssuerPolicy`
for additional providers. Prisma `modelName` values must use delegate names
(`maUser`, `maAccount`, etc.), not PascalCase model names.

This release line supports Better Auth 1.7.18 and Modern Admin’s account identity
tuple: credential accounts are `providerId: 'credential'`,
`issuer: 'local:credential'`, and `accountId: user.id`; account uniqueness is
the pair `(issuer, accountId)`. It does not advertise schema compatibility
with Better Auth 1.6.

Before upgrading a populated 1.6 installation, stop authentication writes and
apply the adapter-specific transactional migration shipped by
`@modern-admin/system-prisma` or `@modern-admin/system-drizzle`. The migrations
fail closed on unknown providers and duplicate identities and never merge or
delete users.

## OIDC SSO and authentik

Use `oidcSsoPlugin()` to connect one or more OpenID Connect providers. It uses
Better Auth's authorization-code flow with PKCE, state and nonce checks, and
requires a signed ID token validated through discovery/JWKS. The configured
issuer must exactly match discovery, including its trailing slash. Unavailable
discovery, missing verification metadata and issuer mismatches fail auth
initialization rather than falling back to an unverified profile.

```ts
import { betterAuth } from 'better-auth'
import {
  accountIdentityPlugin,
  BetterAuthProvider,
  oauthCallbackReplayPlugin,
  oidcSsoPlugin,
} from '@modern-admin/auth-better-auth'

const auth = betterAuth({
  // Keep your database, secret, UUID v7 generator and other plugins here.
  baseURL: 'https://admin.example.com',
  basePath: '/admin/api/auth',
  trustedOrigins: ['https://admin.example.com'],
  emailAndPassword: { enabled: true, disableSignUp: true },
  account: { accountLinking: { enabled: true } },
  plugins: [
    accountIdentityPlugin(),
    oauthCallbackReplayPlugin(),
    oidcSsoPlugin({
      providers: [
        {
          providerId: 'authentik',
          name: 'Company SSO',
          issuer: process.env.SSO_ISSUER!,
          clientId: process.env.SSO_CLIENT_ID!,
          clientSecret: process.env.SSO_CLIENT_SECRET!,
        },
      ],
    }),
  ],
})

const provider = new BetterAuthProvider({ auth })
```

Mount the same `auth` instance with
`createBetterAuthMiddleware(toNodeHandler(auth), { auth })` at its `basePath`.
The public login configuration exposes only provider ids, names and whether
password login is enabled. Client secrets and discovery settings stay on the
server. The login page automatically shows a “Continue with Company SSO” button.

### Configure authentik

1. Create an application with an OAuth2/OpenID Connect **confidential** provider.
   Choose a signing key and enable the `openid`, `email`, `profile` scope mappings.
2. Register the exact redirect URI
   `https://admin.example.com/admin/api/auth/callback/authentik` using strict matching.
   Keep the default per-application issuer, for example
   `https://auth.example.com/application/o/modern-admin/`.
3. Provide the issuer, client id and client secret to the server through your
   secret manager. Discovery defaults to
   `<issuer>/.well-known/openid-configuration`. Set `discoveryUrl` explicitly if
   your IdP serves discovery elsewhere, including authentik's global issuer mode.
4. Configure authentik to emit a truthful `email_verified: true` claim only for
   verified addresses. Unverified identities cannot sign in, including identities
   from `trustedProviders`. Restrict application access with authentik policies.
5. Provision the local admin user with a verified email and the appropriate
   role before their first SSO login. Matching verified emails link the external
   account; subsequent logins use its immutable subject. Changing the IdP email
   does not transfer account ownership. IdP claims never assign admin roles.

`allowSignUp` defaults to `false` for each provider and cannot be bypassed with
`requestSignUp` from the browser. Set `allowSignUp: true` only when your host
deliberately supports provisioning and assigns a suitable default role. Existing
host allowlist hooks still apply. Configure account-linking restrictions through
Better Auth's `account.accountLinking`; this plugin does not relax them.

For several admin panels, register a separate client/application and exact
callback for each panel with the same authentik instance. Each panel maintains
its own users, roles and sessions; authentik reuses its central login session.
Additional providers are entries in `providers`, with distinct `providerId`s.
Keep provider ids and issuer URLs stable once accounts are linked.

### Reference app and generated hosts

The Prisma reference app and newly generated hosts accept `SSO_ISSUER`,
`SSO_DISCOVERY_URL` (optional), `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`,
`SSO_PROVIDER_ID` (default `authentik`) and `SSO_PROVIDER_NAME`.
Their `.env.example` files list the settings without real credentials.

The reference app's Better Auth mount is `/api/auth`, so its callback is
`https://<api-host>/api/auth/callback/authentik`. Generated hosts use
`/admin/api/auth/callback/authentik`. Use the API's public URL, not the SPA
origin when they run on separate domains. Set `AUTH_BASE_URL` for the reference
app or `BETTER_AUTH_URL` for a generated host, and configure `WEB_ORIGIN`.

Hosts using `buildBetterAuth()` can instead pass `oidcSsoProviders: [...]` and
`emailAndPassword: false` programmatically. Set `allowlistOnly: true` to retain
the host-wide provisioning restriction even for providers allowing sign-up.

After testing SSO with an existing user, set `SSO_ONLY=true` to disable
password login endpoints on the server as well as the form. This does not
revoke existing sessions or API keys, disable other plugins such as passkeys,
or implement organization-specific mandatory SSO. Keep a tested recovery
procedure through server configuration. Provider changes require a restart.

Modern Admin's client follows Better Auth's RP-initiated logout URL when the
IdP advertises an end-session endpoint. To keep the central IdP session alive
when logging out of one panel, set `disableProviderLogout: true` on that
provider. Back-channel logout, SCIM and SAML are outside this OIDC integration;
an IdP account being disabled does not immediately revoke an existing local
session. Configure session lifetimes accordingly.

### Design references

Sentry separates its [provider configuration](https://github.com/getsentry/sentry/blob/master/src/sentry/models/authprovider.py),
[external identity](https://github.com/getsentry/sentry/blob/master/src/sentry/models/authidentity.py)
and [login/membership pipeline](https://github.com/getsentry/sentry/blob/master/src/sentry/auth/helper.py).
Modern Admin keeps that separation through server-side provider configuration,
the existing account identity schema and local authorization roles. It uses
Better Auth for protocol handling rather than copying Sentry's organization model.

Protocol setup: [authentik OAuth2/OIDC](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/),
[Better Auth Generic OAuth](https://www.better-auth.com/docs/plugins/generic-oauth).

## API keys

With Better Auth's api-key plugin (`enableSessionForAPIKeys: true`), a key
authenticates as its **owner**. `getCurrentUser` attaches the key's permissions
as the principal's `apiKey` claim, which is what narrows the owner's role in
Modern Admin's action gate. If the key is rejected — Better Auth refuses it
(disabled, expired, rate limit, exhausted quota), the plugin is not mounted, or
the key is not the one the session was minted from — the request is rejected
(`null`), never served with the owner's full role.

The provider asks the configured api-key plugin's own matchers to recognize
key requests, including custom header lists and header-based getters. Its
`apiKeyHeaders` option adds explicit credential headers; a mismatched list
cannot turn a key into an unrestricted session.

Pass the same full Better Auth instance to the provider and to
`createBetterAuthMiddleware(toNodeHandler(auth), { auth })` from
`@modern-admin/nest`. The middleware also uses the plugin's matchers, so its
header settings cannot accidentally admit keys to account-management endpoints.

Each request verifies the key once, in `getSession`; the claim is then read
from the key's row by id through `auth.$context`, so the plugin's rate limit and
`remaining` quota are charged once per request. Only when the row is not in the
database (secondary-storage-only mode) does the provider fall back to
`verifyApiKey`, which charges a second time.

The plugin's default rate limit is 10 requests per key per 24 hours, and it is
copied onto each key when the key is created. For keys that call the admin API,
configure `rateLimit: { timeWindow, maxRequests }` to a realistic budget.

## Repeated OAuth callbacks

Add `oauthCallbackReplayPlugin()` to the Better Auth instance used by an
existing host:

```ts
import { accountIdentityPlugin, oauthCallbackReplayPlugin } from '@modern-admin/auth-better-auth'

// Inside betterAuth({ ... }):
plugins: [accountIdentityPlugin(), oauthCallbackReplayPlugin()]
```

The reference auth factory and newly generated hosts install it automatically.
`BetterAuthProvider` does not modify an already-configured Better Auth instance.

After a successful web login, reopening the same provider callback would otherwise
fail with `state_mismatch` because its one-time state has already been consumed.
For 60 seconds, the plugin redirects an exact repeat to the original validated
destination, provided the browser still has the same active server-side session.
It checks a signed HttpOnly receipt, the provider/code/state digest, expiration,
and the authoritative session store, even when session cookie caching is enabled.
The provider code is never redeemed twice. New logins retain all normal state
checks; failed logins and native deep links are never remembered.

Replicas must share the Better Auth secret and session store. The receipt inherits
the configured cookie prefix and Secure/SameSite attributes; custom auth base paths
are supported. No database migration or sticky-session routing is required.

## Documentation

Setup guides, architecture, and usage examples live in the
[Modern Admin README](https://github.com/modern-admin/modern-admin#readme).

## License

[MIT](https://github.com/modern-admin/modern-admin/blob/main/LICENSE) © Modern Admin
