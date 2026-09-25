# @modern-admin/auth-better-auth

[![npm version](https://img.shields.io/npm/v/@modern-admin/auth-better-auth)](https://www.npmjs.com/package/@modern-admin/auth-better-auth)
[![license](https://img.shields.io/npm/l/@modern-admin/auth-better-auth)](https://github.com/modern-admin/modern-admin/blob/main/LICENSE)

> Better Auth provider integration for Modern Admin (cookie sessions + API keys).

Part of [**Modern Admin**](https://github.com/modern-admin/modern-admin) — a universal, modern admin panel framework
built on NestJS + React 19, with Prisma/Drizzle adapters, Tailwind 4 UI, and
end-to-end Zod validation.

## Installation

```sh
bun add @modern-admin/auth-better-auth better-auth@1.7.5
```

Use `accountIdentityPlugin()` from this package in the Better Auth `plugins`
array. Better Auth 1.7.3 removed its built-in issuer field; this plugin preserves
Modern Admin’s existing required column and unique index without a destructive
schema migration. Issuers are derived from trusted provider configuration,
never client input. Unknown providers fail closed; pass an `AccountIssuerPolicy`
for additional providers. Prisma `modelName` values must use delegate names
(`maUser`, `maAccount`, etc.), not PascalCase model names.

This release line supports Better Auth 1.7.5 and Modern Admin’s account identity
tuple: credential accounts are `providerId: 'credential'`,
`issuer: 'local:credential'`, and `accountId: user.id`; account uniqueness is
the pair `(issuer, accountId)`. It does not advertise schema compatibility
with Better Auth 1.6.

Before upgrading a populated 1.6 installation, stop authentication writes and
apply the adapter-specific transactional migration shipped by
`@modern-admin/system-prisma` or `@modern-admin/system-drizzle`. The migrations
fail closed on unknown providers and duplicate identities and never merge or
delete users.

## API keys

With Better Auth's api-key plugin (`enableSessionForAPIKeys: true`), a key
authenticates as its **owner**. `getCurrentUser` attaches the key's permissions
as the principal's `apiKey` claim, which is what narrows the owner's role in
Modern Admin's action gate. If the key is rejected — Better Auth refuses it
(disabled, expired, rate limit, exhausted quota), the plugin is not mounted, or
the key is not the one the session was minted from — the request is rejected
(`null`), never served with the owner's full role.

If the plugin reads keys from headers other than `x-api-key`, pass the same list
as `apiKeyHeaders` here and to `createBetterAuthMiddleware` from
`@modern-admin/nest`.

Each request verifies the key once, in `getSession`; the claim is then read
from the key's row by id through `auth.$context`, so the plugin's rate limit and
`remaining` quota are charged once per request. Only when the row is not in the
database (secondary-storage-only mode) does the provider fall back to
`verifyApiKey`, which charges a second time.

The plugin's default rate limit is 10 requests per key per 24 hours, and it is
copied onto each key when the key is created. For keys that call the admin API,
configure `rateLimit: { timeWindow, maxRequests }` to a realistic budget.

## Documentation

Setup guides, architecture, and usage examples live in the
[Modern Admin README](https://github.com/modern-admin/modern-admin#readme).

## License

[MIT](https://github.com/modern-admin/modern-admin/blob/main/LICENSE) © Modern Admin
