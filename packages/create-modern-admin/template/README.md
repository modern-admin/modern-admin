# {{name}}

Generated with `create-modern-admin`. This is a NestJS starter wired up with
[`@modern-admin/nest`](https://www.npmjs.com/package/@modern-admin/nest).

## Setup

```sh
bun install
cp .env.example .env
bun run dev
```

The API listens on `http://localhost:3001` by default.

## Next steps

1. Pick an ORM adapter (`@modern-admin/adapter-prisma` or
   `@modern-admin/adapter-drizzle`) and add it to `dependencies`.
2. Register your databases and resources in `src/app.module.ts` via
   `ModernAdminModule.forRoot({ databases: [...], resources: [...] })`.
3. (Optional) Add `@modern-admin/auth-better-auth` for authentication and
   `@modern-admin/cache-redis` for cross-instance caching.
