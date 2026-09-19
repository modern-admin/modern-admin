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

## Documentation

Setup guides, architecture, and usage examples live in the
[Modern Admin README](https://github.com/modern-admin/modern-admin#readme).

## License

[MIT](https://github.com/modern-admin/modern-admin/blob/main/LICENSE) © Modern Admin
