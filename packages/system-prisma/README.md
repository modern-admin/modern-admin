# @modern-admin/system-prisma

[![npm version](https://img.shields.io/npm/v/@modern-admin/system-prisma)](https://www.npmjs.com/package/@modern-admin/system-prisma)
[![license](https://img.shields.io/npm/l/@modern-admin/system-prisma)](https://github.com/modern-admin/modern-admin/blob/main/LICENSE)

> Prisma-backed implementation of Modern Admin system stores (logs, history, webhooks, AI tasks).

Part of [**Modern Admin**](https://github.com/modern-admin/modern-admin) — a universal, modern admin panel framework
built on NestJS + React 19, with Prisma/Drizzle adapters, Tailwind 4 UI, and
end-to-end Zod validation.

## Installation

```sh
bun add @modern-admin/system-prisma
```

## Documentation

Setup guides, architecture, and usage examples live in the
[Modern Admin README](https://github.com/modern-admin/modern-admin#readme).

## Better Auth 1.7 migration

The canonical `prisma/modern-admin.prisma` fragment targets Better Auth 1.7:
`MaAccount.issuer` is required and `(issuer, accountId)` is unique. A populated
Better Auth 1.6 database must be upgraded during an authentication maintenance
window with
`prisma/migrations/better-auth-1.7-account-identities.sql`. Review its explicit
provider mapping first. Unknown providers and identity collisions abort and
roll back the complete transaction; users are never merged or deleted.

## License

[MIT](https://github.com/modern-admin/modern-admin/blob/main/LICENSE) © Modern Admin
