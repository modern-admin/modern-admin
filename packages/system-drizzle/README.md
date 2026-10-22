# @modern-admin/system-drizzle

[![npm version](https://img.shields.io/npm/v/@modern-admin/system-drizzle)](https://www.npmjs.com/package/@modern-admin/system-drizzle)
[![license](https://img.shields.io/npm/l/@modern-admin/system-drizzle)](https://github.com/modern-admin/modern-admin/blob/main/LICENSE)

> Drizzle-backed implementation of Modern Admin system stores.

Part of [**Modern Admin**](https://github.com/modern-admin/modern-admin) — a universal, modern admin panel framework
built on NestJS + React 19, with Prisma/Drizzle adapters, Tailwind 4 UI, and
end-to-end Zod validation.

## Installation

```sh
bun add @modern-admin/system-drizzle
```

## Documentation

Setup guides, architecture, and usage examples live in the
[Modern Admin README](https://github.com/modern-admin/modern-admin#readme).

## Better Auth 1.7 migration

The PostgreSQL schema targets Better Auth 1.7: `ma_account.issuer` is required
and `(issuer, account_id)` is unique. A populated Better Auth 1.6 database must
be upgraded during an authentication maintenance window with
`migrations/postgres/better-auth-1.7-account-identities.sql`. Review its
explicit provider mapping first. Unknown providers and identity collisions
abort and roll back the complete transaction; users are never merged or
deleted.

The Better Auth 1.7.5 → 1.7.12 update does not add columns. The exported
PostgreSQL tables also include the upstream lookup indexes on session
`user_id`, verification `identifier`, and API-key `config_id`, `reference_id`,
and `key`. Apply any missing indexes through your Drizzle migration workflow
after updating the package; updating the schema exports alone does not alter
an existing database.

## License

[MIT](https://github.com/modern-admin/modern-admin/blob/main/LICENSE) © Modern Admin
