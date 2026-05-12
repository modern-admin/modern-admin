---
title: OpenAPI & Scalar
description: Build an OpenAPI document for the Nest module and serve Swagger UI / Scalar reference UI.
---

# OpenAPI & Scalar

`@modern-admin/nest` ships a `setupOpenApi(app, options)` helper that builds a
full OpenAPI 3 document for the framework's REST surface and mounts:

- **Raw JSON spec** at `GET /admin/api/openapi.json` (configurable).
- **Swagger UI** at `GET /admin/api/docs` (configurable, can be disabled).
- **Scalar UI** at `GET /admin/api/reference` — only when the optional peer
  dependency `@scalar/nestjs-api-reference` is installed (loaded via dynamic
  `import()`, no hard requirement on Scalar otherwise).

All built-in controllers are tagged (`Admin / Config`, `Admin / Auth`,
`Admin / Resources`, `Admin / Analytics`, `Admin / History`,
`Admin / Audit Log`, `Admin / API Keys`, `Admin / Webhooks`,
`Admin / AI Assistant`, `Admin / Uploads`) so the rendered UIs group
endpoints by subsystem.

---

## Quick start

```bash
bun add @nestjs/swagger              # already a dep of @modern-admin/nest
bun add @scalar/nestjs-api-reference # optional — adds the Scalar UI
```

Direct usage in `main.ts`:

```ts
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { setupOpenApi } from '@modern-admin/nest'
import { AppModule } from './app.module.js'

const app = await NestFactory.create<NestExpressApplication>(AppModule)

await setupOpenApi(app, {
  title: 'My Admin API',
  description: 'REST surface of @modern-admin/nest.',
  version: '1.0.0',
  cookie: { description: 'Better Auth session cookie.' },
  bearer: { description: 'Admin API key.' },
  scalar: { theme: 'default' },
})

await app.listen(3001)
```

If you use the reference `bootstrapApp` helper from `@modern-admin/app-shared`,
just pass an `openApi` block:

```ts
import { bootstrapApp } from '@modern-admin/app-shared'

void bootstrapApp({
  AppModule,
  auth,
  label: 'my-admin',
  openApi: {
    title: 'My Admin',
    cookie: true,
    bearer: true,
    scalar: { theme: 'default' },
  },
})
```

`openApi: true` enables it with framework defaults; omitting `openApi` (or
`openApi: false`) disables OpenAPI entirely.

---

## Options reference

`SetupOpenApiOptions`:

| Option | Default | Description |
|--------|---------|-------------|
| `title` | `'Modern Admin API'` | Document title |
| `description` | (generic) | Short prose at the top of the UI |
| `version` | `'1.0.0'` | Document version |
| `jsonPath` | `/admin/api/openapi.json` | Where the raw JSON is mounted. CORS is wide-open on this route for codegen tooling |
| `swaggerPath` | `/admin/api/docs` | Path for Swagger UI. Pass `false` to skip |
| `swaggerOptions` | — | Forwarded to `SwaggerModule.setup()` (custom CSS, persistAuthorization, etc.) |
| `scalarPath` | `/admin/api/reference` | Path for Scalar UI. Pass `false` to skip |
| `scalar` | `true` | `true` / `{ theme, pageTitle, … }` to enable Scalar. `false` to disable. Silently no-ops when peer is not installed |
| `bearer` | — | `true` for defaults, `{ name?, bearerFormat?, description? }`. Adds an HTTP Bearer security scheme |
| `cookie` | — | `true` for defaults, `{ cookieName?, name?, description? }`. Adds an `apiKey`-in-cookie scheme (Better Auth session) |
| `tags` | `[]` | Static tag list `[{ name, description? }]` |
| `servers` | `[]` | Extra `servers: []` entries for the document |
| `transformDocument` | — | Mutator hook called with the built document right before it's mounted |

---

## URLs

| URL | Content |
|-----|---------|
| `/admin/api/openapi.json` | Raw OpenAPI 3 document (wide-open CORS) |
| `/admin/api/docs` | Swagger UI |
| `/admin/api/reference` | Scalar UI (requires `@scalar/nestjs-api-reference`) |

---

## Tagging your own controllers

Use the standard `@nestjs/swagger` decorators on any custom controllers:

```ts
import { ApiTags, ApiOperation } from '@nestjs/swagger'

@ApiTags('Reports')
@Controller('admin/api/reports')
export class ReportsController {
  @ApiOperation({ summary: 'Quarterly P&L' })
  @Get('pnl')
  pnl() { /* … */ }
}
```

If you also want the document to inherit the cookie/bearer auth schemes
declared via `setupOpenApi`, add `@ApiCookieAuth('session')` or
`@ApiBearerAuth('apiKey')` accordingly.

---

## Why Scalar is optional

Scalar's UI is heavier than Swagger UI and brings its own assets. Making it an
**optional peer dependency** keeps the default install slim — users who only
want the JSON spec or Swagger UI don't pay for Scalar at all. The dynamic
`import()` inside `setupOpenApi` silently no-ops when the peer is missing and
logs a single hint pointing at how to enable it.
