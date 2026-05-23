/**
 * Express middleware that serves the prebuilt @modern-admin/web SPA — its
 * `index.html` (with runtime config injected) and the hashed `assets/*`
 * files — under a configurable mount path (`/admin` by default).
 *
 * The middleware is mounted via `ModernAdminStaticUiModule` which uses
 * `consumer.apply(...).forRoutes(...)` and `.exclude()` to keep the
 * `${path}/api/*` routes pointed at the regular admin controllers.
 *
 * Asset URLs are rewritten from the build's `./assets/...` to absolute
 * `${path}/assets/...` so deep links into the SPA (browser-history routes
 * like `/admin/resources/users`) still resolve correctly.
 */

import {
  Inject,
  Injectable,
  Logger,
  type NestMiddleware,
  Optional,
} from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { createRequire } from 'node:module'

/**
 * Runtime config injected into `window.__MODERN_ADMIN__`. Mirrors
 * `ModernAdminRuntimeConfig` from `@modern-admin/web` — kept loose here
 * (`Record<string, unknown>`) so this package doesn't depend on the
 * frontend package at type-level.
 */
export type ModernAdminUiRuntimeConfig = Record<string, unknown>

export interface ModernAdminStaticUiOptions {
  /**
   * URL prefix where the SPA is mounted. Defaults to `/admin`. Must match
   * the prefix configured on the consumer's NestJS app so the API
   * (`/admin/api/*`) and the SPA share the same root.
   */
  path?: string
  /**
   * Runtime configuration serialised into `window.__MODERN_ADMIN__`. May
   * be a static object, or a request-aware factory (e.g. to vary the
   * locale per `Accept-Language`).
   */
  runtimeConfig?:
    | ModernAdminUiRuntimeConfig
    | ((req: Request) => ModernAdminUiRuntimeConfig | Promise<ModernAdminUiRuntimeConfig>)
  /**
   * Package name of the prebuilt SPA. Defaults to `@modern-admin/web`.
   * Override to ship a custom-branded bundle, as long as it exposes the
   * same `standalone/` directory layout (with `index.html` and
   * `assets/`).
   */
  webPackage?: string
  /**
   * Page <title>. Defaults to "Modern Admin". Replaced in the HTML
   * shell before serving.
   */
  title?: string
}

const DEFAULT_PATH = '/admin'
const DEFAULT_WEB_PACKAGE = '@modern-admin/web'
const CONFIG_MARKER = '<!--MODERN_ADMIN_CONFIG-->'
const ASSET_PREFIX_PATTERN = /(["'(])\.\/assets\//g

const MIME_TYPES: Record<string, string> = {
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
}

export const MODERN_ADMIN_STATIC_UI_OPTIONS = Symbol(
  'MODERN_ADMIN_STATIC_UI_OPTIONS',
)

@Injectable()
export class ModernAdminStaticUiMiddleware implements NestMiddleware {
  private readonly log = new Logger('ModernAdminStaticUi')
  private readonly mountPath: string
  private readonly standaloneDir: string
  private readonly htmlTemplate: string

  constructor(
    @Optional()
    @Inject(MODERN_ADMIN_STATIC_UI_OPTIONS)
    private readonly options: ModernAdminStaticUiOptions = {},
  ) {
    this.mountPath = stripTrailingSlash(options.path ?? DEFAULT_PATH)
    this.standaloneDir = resolveStandaloneDir(
      options.webPackage ?? DEFAULT_WEB_PACKAGE,
    )
    this.htmlTemplate = this.loadHtmlTemplate()
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    // The Nest middleware consumer pre-filters to `${path}*` and excludes
    // `${path}/api/*`, so anything reaching here is either the SPA root or
    // a static asset request that resolves under the mount.
    const url = req.originalUrl.split('?')[0] ?? '/'
    const relative = stripPrefix(url, this.mountPath)

    // Static assets — resolve against `standalone/` and stream them.
    if (relative.startsWith('/assets/') || relative === '/favicon.svg') {
      const filePath = safeJoin(this.standaloneDir, relative)
      if (filePath && existsSync(filePath) && statSync(filePath).isFile()) {
        const mime = MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
        res.setHeader('Content-Type', mime)
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        createReadStream(filePath).pipe(res)
        return
      }
      // Asset not found → fall through to 404. Avoid returning the SPA
      // shell for asset URLs; the browser would parse the HTML as JS/CSS
      // and crash.
      res.status(404).send('Not found')
      return
    }

    // Everything else (including deep SPA paths) → render the shell.
    try {
      const html = await this.renderHtml(req)
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      // No long-lived caching for the shell — config is request-time data.
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.send(html)
    } catch (err) {
      this.log.error('Failed to render admin shell', err as Error)
      next(err as Error)
    }
  }

  /**
   * Loads `<webPackage>/dist/standalone/index.html` and bakes in two
   * transformations that don't depend on the request:
   *
   *   1. Rewrites build-time relative `./assets/...` references to absolute
   *      `${mountPath}/assets/...`, so deep links survive.
   *   2. Optionally swaps the document `<title>`.
   *
   * The result is cached in memory; per-request config injection happens
   * later in `renderHtml`.
   */
  private loadHtmlTemplate(): string {
    const indexPath = join(this.standaloneDir, 'index.html')
    if (!existsSync(indexPath)) {
      throw new Error(
        `[modern-admin] could not find SPA shell at ${indexPath}. Did you run \`bun --filter @modern-admin/web build\`?`,
      )
    }
    let html = readFileSync(indexPath, 'utf8')
    html = html.replace(ASSET_PREFIX_PATTERN, `$1${this.mountPath}/assets/`)
    // Same for `<link rel="icon" href="./favicon.svg">`.
    html = html.replace(/(["'])\.\/favicon\.svg/g, `$1${this.mountPath}/favicon.svg`)
    if (this.options.title) {
      html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(this.options.title)}</title>`)
    }
    return html
  }

  private async renderHtml(req: Request): Promise<string> {
    const config = await this.resolveConfig(req)
    const inject = `<script>window.__MODERN_ADMIN__ = ${safeJsonForScript(config)};</script>`
    if (this.htmlTemplate.includes(CONFIG_MARKER)) {
      return this.htmlTemplate.replace(CONFIG_MARKER, inject)
    }
    // Fallback: prepend before `</head>` if the marker is missing.
    return this.htmlTemplate.replace(/<\/head>/, `${inject}</head>`)
  }

  private async resolveConfig(req: Request): Promise<ModernAdminUiRuntimeConfig> {
    const raw = this.options.runtimeConfig
    const userConfig: ModernAdminUiRuntimeConfig = raw
      ? typeof raw === 'function'
        ? await raw(req)
        : raw
      : {}
    // Always inject `basePath` from the mount path so the SPA router knows
    // where it is mounted without any manual configuration by the host app.
    // User-supplied `basePath` in runtimeConfig takes precedence if provided.
    return { basePath: this.mountPath || '/', ...userConfig }
  }
}

/**
 * Resolves the absolute path to `<webPackage>/dist/standalone/`. We try two
 * resolution contexts in order:
 *
 *   1. The host app's CWD — where workspace and `node_modules` symlinks
 *      actually live. This is the common case: the host installs
 *      `@modern-admin/web` as a dependency.
 *   2. This middleware file's URL — fallback for unusual layouts where the
 *      package is hoisted next to `@modern-admin/nest` itself.
 *
 * `createRequire` is used so the lookup works in both CJS and ESM hosts.
 */
function resolveStandaloneDir(webPackage: string): string {
  const candidates = [
    createRequire(join(process.cwd(), 'package.json')),
    createRequire(import.meta.url),
  ]
  const errors: string[] = []
  for (const req of candidates) {
    try {
      const pkgJsonPath = req.resolve(`${webPackage}/package.json`)
      return join(pkgJsonPath, '..', 'dist', 'standalone')
    } catch (err) {
      errors.push((err as Error).message)
    }
  }
  throw new Error(
    `[modern-admin] could not resolve "${webPackage}/package.json": ${errors.join(' | ')}. ` +
      `Install it in the host app (\`bun add ${webPackage}\`) or set \`webPackage\` in ModernAdminStaticUiModule options.`,
  )
}

function stripTrailingSlash(path: string): string {
  if (path === '/' || path === '') return ''
  return path.endsWith('/') ? path.slice(0, -1) : path
}

function stripPrefix(url: string, prefix: string): string {
  if (!prefix) return url
  if (url === prefix) return '/'
  if (url.startsWith(prefix + '/')) return url.slice(prefix.length)
  return url
}

/**
 * Joins `base` with `rel` and guarantees the result stays inside `base`.
 * Returns `null` for any traversal attempt (`..`) — protects the asset
 * route from leaking arbitrary files off-tree.
 */
function safeJoin(base: string, rel: string): string | null {
  const resolved = resolve(base, '.' + normalize(rel))
  const baseResolved = resolve(base)
  if (resolved !== baseResolved && !resolved.startsWith(baseResolved + '/')) {
    return null
  }
  return resolved
}

/**
 * JSON.stringify with the closing-script-tag sequence escaped so injected
 * config can't break out of the surrounding `<script>` element.
 */
function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value ?? {}).replace(/</g, '\\u003c')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
