// Shared Nest bootstrap for the reference apps. Encapsulates the bits
// every flavour does identically: static `/uploads`, CORS, and mounting
// Better Auth's Express handler at `/api/auth`. The only host-specific
// work happens before listen — usually migrations and seed steps —
// supplied via `preBootstrap`.
//
// Note: the Express `query parser` setting is forced to `'extended'` by
// ModernAdminBootstrapService at OnApplicationBootstrap so user
// bootstraps don't have to remember the Express 5 default change
// (`'simple'`) that breaks `filters[k]=v` bracket params.

import 'reflect-metadata'
import { join } from 'node:path'
import { NestFactory } from '@nestjs/core'
import type { INestApplication } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { toNodeHandler } from 'better-auth/node'
import type { betterAuth } from 'better-auth'
import { setupOpenApi, type SetupOpenApiOptions } from '@modern-admin/nest'

type AuthInstance = ReturnType<typeof betterAuth>

export interface BootstrapAppOptions {
  /** Root Nest module of the host app. */
  AppModule: unknown
  /** Better Auth instance whose handler is mounted at `/api/auth`. */
  auth: AuthInstance
  /** Log prefix and identity (e.g. `modern-admin/api`, `modern-admin/api-prisma`). */
  label: string
  /** Default port when neither `API_PORT` nor an explicit override is set. */
  defaultPort?: number
  /** Default uploads dir (relative to `process.cwd()`); served at `/uploads`. */
  uploadsDir?: string
  /**
   * Async hook that runs before NestFactory.create — use this for
   * database migrations and demo seed steps that must complete before
   * the app starts handling traffic.
   */
  preBootstrap?: () => Promise<void>
  /**
   * Mount the OpenAPI JSON spec, Swagger UI, and (when installed) Scalar
   * UI before `app.listen`. Pass `true` for sane defaults, an options
   * object to customise paths/auth schemes, or `false`/omit to disable.
   */
  openApi?: SetupOpenApiOptions | true | false
  /** Final hook called with the live app, before logging the listen line. */
  afterListen?: (app: INestApplication) => void | Promise<void>
}

/**
 * Standard bootstrap pipeline:
 *
 *   1. Run `preBootstrap` (migrations, seeds).
 *   2. Build the Nest app from `AppModule`.
 *   3. Serve `<cwd>/uploads` under `/uploads` for the file feature.
 *   4. Enable CORS using `WEB_ORIGIN` (csv) or wide-open in dev.
 *   5. Mount Better Auth's Node handler at `/api/auth/*` BEFORE any body
 *      parsers can consume the request stream Better Auth needs raw.
 *   6. Listen on `API_PORT` / `API_HOST`.
 */
export async function bootstrapApp(options: BootstrapAppOptions): Promise<void> {
  const {
    AppModule,
    auth,
    label,
    defaultPort = 3001,
    uploadsDir = 'uploads',
    preBootstrap,
    openApi,
    afterListen,
  } = options

  if (preBootstrap) await preBootstrap()

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule as Parameters<typeof NestFactory.create>[0],
  )
  app.useStaticAssets(join(process.cwd(), uploadsDir), { prefix: '/uploads' })
  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(',') ?? true,
    credentials: true,
  })

  // Mount Better Auth at /api/auth/*. Has to come before any body parser
  // — Nest's default JSON parser would otherwise consume the request
  // stream Better Auth needs raw access to.
  app.use('/api/auth', toNodeHandler(auth))

  // OpenAPI spec + Swagger UI + Scalar UI. Mounted before listen so the
  // first request can already hit `/admin/api/docs`.
  let openApiPaths: { swagger?: string; scalar?: string; json: string } | null = null
  if (openApi) {
    const opts: SetupOpenApiOptions = openApi === true ? {} : openApi
    await setupOpenApi(app, opts)
    openApiPaths = {
      json: opts.jsonPath ?? '/admin/api/openapi.json',
      swagger: opts.swaggerPath === false
        ? undefined
        : (typeof opts.swaggerPath === 'string' ? opts.swaggerPath : '/admin/api/docs'),
      scalar: opts.scalarPath === false || opts.scalar === false
        ? undefined
        : (typeof opts.scalarPath === 'string' ? opts.scalarPath : '/admin/api/reference'),
    }
  }

  const port = Number(process.env.API_PORT ?? defaultPort)
  await app.listen(port, process.env.API_HOST ?? '0.0.0.0')

  if (afterListen) await afterListen(app)


  console.log(`[${label}] listening on http://localhost:${port}`)

  console.log(`[${label}] auth endpoints under /api/auth`)
  if (openApiPaths) {

    console.log(`[${label}] OpenAPI JSON  http://localhost:${port}${openApiPaths.json}`)
    if (openApiPaths.swagger) {

      console.log(`[${label}] Swagger UI    http://localhost:${port}${openApiPaths.swagger}`)
    }
    if (openApiPaths.scalar) {

      console.log(`[${label}] Scalar UI     http://localhost:${port}${openApiPaths.scalar}`)
    }
  }
}
