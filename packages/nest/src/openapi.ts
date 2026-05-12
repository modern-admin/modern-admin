// OpenAPI + Scalar wiring for ModernAdmin's Nest module.
//
// `setupOpenApi(app, options)` is a thin wrapper around `@nestjs/swagger`
// that builds the document, exposes it as raw JSON, and mounts UIs:
//   • The standard Swagger UI at `swaggerPath` (default
//     `/admin/api/docs`).
//   • An optional Scalar UI at `scalarPath` (default
//     `/admin/api/reference`) — only if the host installs the optional
//     peer `@scalar/nestjs-api-reference` and does not opt out via
//     `scalar: false`.
//
// `@scalar/nestjs-api-reference` is loaded with a dynamic import so the
// framework does not hard-require it; if the package is missing the
// Swagger UI still works and a friendly diagnostic is logged.

import type { INestApplication } from '@nestjs/common'
import { Logger } from '@nestjs/common'
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
  type SwaggerCustomOptions,
} from '@nestjs/swagger'

export interface OpenApiBearerOption {
  /** Logical id used by `@ApiBearerAuth(name)` on protected routes. */
  name?: string
  bearerFormat?: string
  description?: string
}

export interface OpenApiCookieOption {
  /** Logical id used by `@ApiCookieAuth(name)`. */
  name?: string
  cookieName?: string
  description?: string
}

export interface OpenApiTagDef {
  name: string
  description?: string
}

export interface SetupOpenApiOptions {
  title?: string
  description?: string
  version?: string

  /** Mount path for the JSON document. Default `/admin/api/openapi.json`. */
  jsonPath?: string

  /** Mount path for Swagger UI. Default `/admin/api/docs`. Set `false` to disable. */
  swaggerPath?: string | false
  swaggerOptions?: SwaggerCustomOptions

  /**
   * Mount path for Scalar UI. Default `/admin/api/reference`. Set `false`
   * to disable. Loaded dynamically — silently skipped if
   * `@scalar/nestjs-api-reference` is not installed.
   */
  scalarPath?: string | false
  scalar?: boolean | ScalarOptions

  /** Bearer (HTTP `Authorization`) auth scheme. Pass `true` for defaults. */
  bearer?: boolean | OpenApiBearerOption
  /** Cookie auth scheme — useful for the Better Auth session cookie. */
  cookie?: boolean | OpenApiCookieOption

  /** Static tag list (for grouping). Controllers can also self-tag via `@ApiTags`. */
  tags?: OpenApiTagDef[]
  /** Add additional servers to the document (`servers: []`). */
  servers?: { url: string; description?: string }[]
  /** When true, controllers without `@ApiTags` keep Nest's class-name fallback (default). */
  ignoreGlobalPrefix?: boolean
  /** Hook to mutate the document right before mounting. */
  transformDocument?: (doc: OpenAPIObject) => OpenAPIObject
}

/** Scalar-specific options forwarded to `apiReference({ ...content })`. */
export interface ScalarOptions {
  /** UI theme — see https://github.com/scalar/scalar for the full list. */
  theme?: string
  /** Page title. */
  pageTitle?: string
  /** Hide the "Try it" panel etc. */
  hideModels?: boolean
  /** Pass-through for any future Scalar option without forcing a bump here. */
  [key: string]: unknown
}

const DEFAULTS = {
  title: 'Modern Admin API',
  description: 'REST surface exposed by @modern-admin/nest.',
  version: '1.0.0',
  jsonPath: '/admin/api/openapi.json',
  swaggerPath: '/admin/api/docs' as string | false,
  scalarPath: '/admin/api/reference' as string | false,
}

/**
 * Build and mount the OpenAPI document.
 *
 * @returns the built `OpenAPIObject` (handy for tests and manual tooling).
 */
export async function setupOpenApi(
  app: INestApplication,
  options: SetupOpenApiOptions = {},
): Promise<OpenAPIObject> {
  const log = new Logger('ModernAdmin/OpenAPI')

  const builder = new DocumentBuilder()
    .setTitle(options.title ?? DEFAULTS.title)
    .setDescription(options.description ?? DEFAULTS.description)
    .setVersion(options.version ?? DEFAULTS.version)

  for (const tag of options.tags ?? []) {
    builder.addTag(tag.name, tag.description)
  }

  for (const srv of options.servers ?? []) {
    builder.addServer(srv.url, srv.description)
  }

  if (options.bearer) {
    const cfg: OpenApiBearerOption =
      typeof options.bearer === 'object' ? options.bearer : {}
    builder.addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: cfg.bearerFormat ?? 'API Key',
        description: cfg.description ?? 'Modern Admin API key.',
      },
      cfg.name ?? 'apiKey',
    )
  }

  if (options.cookie) {
    const cfg: OpenApiCookieOption =
      typeof options.cookie === 'object' ? options.cookie : {}
    builder.addCookieAuth(
      cfg.cookieName ?? 'better-auth.session_token',
      {
        type: 'apiKey',
        in: 'cookie',
        name: cfg.cookieName ?? 'better-auth.session_token',
        description: cfg.description ?? 'Better Auth session cookie.',
      },
      cfg.name ?? 'session',
    )
  }

  let document = SwaggerModule.createDocument(app, builder.build(), {
    ignoreGlobalPrefix: options.ignoreGlobalPrefix ?? false,
  })
  if (options.transformDocument) document = options.transformDocument(document)

  // Raw JSON spec — handy for codegen, Postman/Insomnia, third-party UIs.
  const jsonPath = normalisePath(options.jsonPath ?? DEFAULTS.jsonPath)
  const httpAdapter = app.getHttpAdapter()
  // Express's `getInstance()` is the underlying Express app; Fastify's
  // `getInstance()` is the Fastify instance. Both expose `.get(path, fn)`.
  // We use the adapter directly to stay platform-agnostic.
  httpAdapter.get(jsonPath, (_req: unknown, res: unknown) => {
    const reply = res as {
      setHeader?: (k: string, v: string) => void
      header?: (k: string, v: string) => void
      send: (body: unknown) => void
    }
    const setHeader = reply.setHeader?.bind(reply) ?? reply.header?.bind(reply)
    setHeader?.('Content-Type', 'application/json; charset=utf-8')
    setHeader?.('Access-Control-Allow-Origin', '*')
    reply.send(document)
  })

  if (options.swaggerPath !== false) {
    const swaggerPath = normalisePath(
      typeof options.swaggerPath === 'string' ? options.swaggerPath : DEFAULTS.swaggerPath as string,
    )
    SwaggerModule.setup(swaggerPath, app, document, options.swaggerOptions)
  }

  if (options.scalarPath !== false && options.scalar !== false) {
    const scalarPath = normalisePath(
      typeof options.scalarPath === 'string'
        ? options.scalarPath
        : (DEFAULTS.scalarPath as string),
    )
    const scalarCfg: ScalarOptions =
      typeof options.scalar === 'object' && options.scalar !== null ? options.scalar : {}
    await mountScalar(app, scalarPath, document, scalarCfg, log)
  }

  return document
}

async function mountScalar(
  app: INestApplication,
  path: string,
  document: OpenAPIObject,
  scalarCfg: ScalarOptions,
  log: Logger,
): Promise<void> {
  let apiReference: ((opts: Record<string, unknown>) => unknown) | null = null
  try {
    // Optional peer — load lazily so users who do not install Scalar are
    // not penalised at module-eval time.
    const mod = (await import('@scalar/nestjs-api-reference')) as {
      apiReference?: (opts: Record<string, unknown>) => unknown
    }
    apiReference = mod.apiReference ?? null
  } catch {
    log.log(
      `Scalar UI not mounted: install @scalar/nestjs-api-reference to enable it at ${path}`,
    )
    return
  }
  if (!apiReference) return

  const handler = apiReference({
    theme: scalarCfg.theme ?? 'default',
    ...scalarCfg,
    content: document,
  })

  // The handler returned by `apiReference` is an Express middleware. We
  // bolt it onto the underlying http adapter so it works regardless of
  // whether the host swaps body parsers etc.
  const adapter = app.getHttpAdapter()
  const instance = adapter.getInstance() as { use?: (path: string, mw: unknown) => void }
  if (typeof instance.use === 'function') {
    instance.use(path, handler)
  } else {
    log.warn(
      `Scalar UI requested but http adapter does not expose .use(path, mw); skipping`,
    )
  }
}

function normalisePath(p: string): string {
  if (!p.startsWith('/')) return `/${p}`
  return p.replace(/\/+$/, '')
}
