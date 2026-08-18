# @modern-admin/create

[![npm version](https://img.shields.io/npm/v/@modern-admin/create)](https://www.npmjs.com/package/@modern-admin/create)
[![license](https://img.shields.io/npm/l/@modern-admin/create)](https://github.com/modern-admin/modern-admin/blob/main/LICENSE)

> CLI for scaffolding a standalone admin service, adding system tables to an
> existing project, and creating a host-owned custom UI bundle.

Part of [**Modern Admin**](https://github.com/modern-admin/modern-admin) — a universal, modern admin panel framework
built on NestJS + React 19, with Prisma/Drizzle adapters, Tailwind 4 UI, and
end-to-end Zod validation.

## Installation

```sh
bun add --dev @modern-admin/create
```

## Commands

```sh
# New standalone admin service
bun create @modern-admin admin-service

# Add Modern Admin system tables to an existing Prisma/Drizzle project
bunx @modern-admin/create generate

# Create and connect a custom Vite/React admin UI in an existing host
bunx @modern-admin/create setup-ui
```

`setup-ui` creates `ui/`, registers it through
`ModernAdminStaticUiModule.forRoot({ webPackage: './ui' })`, and adds the
required host dependencies and `ui:*` scripts. Use `--api-proxy` when the
backend does not run at `http://localhost:3001`:

```sh
bunx @modern-admin/create setup-ui --api-proxy http://localhost:3334
bun install
bun run ui:build
```

The generated `ui/src/admin-components.ts` is the single registration point
for custom property and action components. Existing generated UI files are
preserved on subsequent runs.

## Documentation

Setup guides, command options, and custom-component examples live in the
[Modern Admin documentation](https://docs.modernadminpro.com/docs/cli).

## License

[MIT](https://github.com/modern-admin/modern-admin/blob/main/LICENSE) © Modern Admin
