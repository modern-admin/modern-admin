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
 *
 * Whitelabeling is supported without patching the shell by hand: see
 * `themeCss`, `faviconUrl`, `headHtml`, and `staticFiles` below.
 */

import { Inject, Injectable, Logger, type NestMiddleware, Optional } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { createRequire } from 'node:module'

/**
 * Runtime config injected into `window.__MODERN_ADMIN__`. Mirrors
 * `ModernAdminRuntimeConfig` from `@modern-admin/web` — kept loose here
 * (`Record<string, unknown>`) so this package doesn't depend on the
 * frontend package at type-level.
 *
 * Hosts that want typo safety pass the frontend type as a generic argument:
 * `ModernAdminStaticUiModule.forRoot<ModernAdminRuntimeConfig>({ … })`.
 */
export type ModernAdminUiRuntimeConfig = Record<string, unknown>

/**
 * The subset of an Express `Request` the request-aware option factories
 * actually read. Declared structurally so hosts can type their factories
 * without `@types/express` installed — an Express `Request` is assignable
 * to it.
 */
export interface AdminHttpRequest {
  headers: Record<string, string | string[] | undefined>
  originalUrl: string
  method: string
}

/** Request-aware factory for the runtime config injected into the shell. */
export type ModernAdminRuntimeConfigFactory<TConfig = ModernAdminUiRuntimeConfig> = (
  req: AdminHttpRequest,
) => TConfig | Promise<TConfig>

/** Request-aware factory for extra `<head>` markup (e.g. per-tenant theming). */
export type ModernAdminHeadHtmlFactory = (req: AdminHttpRequest) => string | Promise<string>

export interface ModernAdminStaticUiOptions<TConfig = ModernAdminUiRuntimeConfig> {
  /**
   * URL prefix where the SPA is mounted. Defaults to `/admin`. Must match
   * the prefix configured on the consumer's NestJS app so the API
   * (`/admin/api/*`) and the SPA share the same root.
   *
   * A root mount (`'/'`) is rejected: the admin API lives at the fixed
   * `/admin/api/*` prefix, which a root mount would swallow.
   */
  path?: string
  /**
   * Runtime configuration serialised into `window.__MODERN_ADMIN__`. May
   * be a static object, or a request-aware factory (e.g. to vary the
   * locale per `Accept-Language`).
   */
  runtimeConfig?: TConfig | ModernAdminRuntimeConfigFactory<TConfig>
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
  /**
   * Raw HTML appended to `<head>`, after the framework's own tags. Static,
   * or request-aware for per-tenant theming.
   *
   * Injected verbatim — it is host-authored markup, never user input.
   */
  headHtml?: string | ModernAdminHeadHtmlFactory
  /**
   * CSS injected as a `<style>` block — sugar for the common case of
   * overriding the `:root` / `.dark` design tokens:
   *
   * ```ts
   * themeCss: ':root{--primary:262 83% 58%}.dark{--primary:262 83% 68%}'
   * ```
   */
  themeCss?: string
  /**
   * Replaces the built-in `<link rel="icon">`. Any URL the browser can
   * reach — an absolute path served by the host, or a `staticFiles` entry.
   */
  faviconUrl?: string
  /**
   * Extra files served under the mount, beyond `assets/` and
   * `favicon.svg`. Key = URL path relative to the mount (leading slash
   * optional); value = absolute path on disk.
   *
   * ```ts
   * staticFiles: { '/logo.png': join(process.cwd(), 'brand/logo.png') }
   * ```
   */
  staticFiles?: Record<string, string>
}

const DEFAULT_PATH = '/admin'
const DEFAULT_WEB_PACKAGE = '@modern-admin/web'
const CONFIG_MARKER = '<!--MODERN_ADMIN_CONFIG-->'
const ASSET_PREFIX_PATTERN = /(["'(])\.\/assets\//g
const THEME_STORAGE_KEY = 'modern-admin:theme'
const LOCALE_STORAGE_KEY = 'modern-admin:locale'

/**
 * Runs before the stylesheet is applied, so dark-mode users don't get a
 * white flash while the ~3MB of app JS parses. Mirrors `readThemeMode()` /
 * `applyClass()` from `@modern-admin/ui`'s `theme.ts`, and the locale
 * persistence in `@modern-admin/react`'s `I18nProvider`.
 */
const PRE_PAINT_SCRIPT =
  '<script>(function(){try{' +
  `var m=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
  "if(m==='dark'||((!m||m==='system')&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches))" +
  "document.documentElement.classList.add('dark');" +
  `var l=localStorage.getItem(${JSON.stringify(LOCALE_STORAGE_KEY)});` +
  'if(l)document.documentElement.lang=l;' +
  '}catch(e){}})()</script>'

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
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
}

// Order matters: brotli compresses ~15-20% better than gzip, try it first.
const PRECOMPRESSED_VARIANTS = [
  { encoding: 'br', suffix: '.br' },
  { encoding: 'gzip', suffix: '.gz' },
] as const

export const MODERN_ADMIN_STATIC_UI_OPTIONS = Symbol('MODERN_ADMIN_STATIC_UI_OPTIONS')

@Injectable()
export class ModernAdminStaticUiMiddleware implements NestMiddleware {
  private readonly log = new Logger('ModernAdminStaticUi')
  private readonly mountPath: string
  private readonly standaloneDir: string
  private readonly htmlTemplate: string
  /** `staticFiles` normalised to `/leading-slash` URL keys. */
  private readonly staticFiles: Map<string, string>

  constructor(
    @Optional()
    @Inject(MODERN_ADMIN_STATIC_UI_OPTIONS)
    private readonly options: ModernAdminStaticUiOptions = {},
  ) {
    this.mountPath = assertMountPath(options.path ?? DEFAULT_PATH)
    this.standaloneDir = resolveStandaloneDir(options.webPackage ?? DEFAULT_WEB_PACKAGE)
    this.staticFiles = normalizeStaticFiles(options.staticFiles)
    this.htmlTemplate = this.loadHtmlTemplate()
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    // The Nest middleware consumer pre-filters to `${path}*` and excludes
    // `${path}/api/*`, so anything reaching here is either the SPA root or
    // a static asset request that resolves under the mount.
    const url = req.originalUrl.split('?')[0] ?? '/'
    const relative = stripPrefix(url, this.mountPath)

    // Host-supplied extras (logo, apple-touch-icon, manifest, robots.txt).
    // Checked before the built-in asset route so a host can also override
    // `favicon.svg` by path.
    const extra = this.staticFiles.get(relative)
    if (extra) {
      if (existsSync(extra) && statSync(extra).isFile()) {
        // Not content-hashed, so no `immutable` — an hour is long enough
        // to keep a logo out of the hot path, short enough to re-brand.
        this.sendFile(req, res, extra, 'public, max-age=3600')
      } else {
        this.log.warn(`staticFiles entry "${relative}" points at a missing file: ${extra}`)
        res.status(404).send('Not found')
      }
      return
    }

    // Static assets — resolve against `standalone/` and stream them.
    if (relative.startsWith('/assets/') || relative === '/favicon.svg') {
      const filePath = safeJoin(this.standaloneDir, relative)
      if (filePath && existsSync(filePath) && statSync(filePath).isFile()) {
        this.sendFile(req, res, filePath, 'public, max-age=31536000, immutable')
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
   * Streams `filePath`, preferring a precompressed `.br` / `.gz` sibling
   * when the client accepts it — the standalone JS is an order of
   * magnitude smaller over the wire.
   */
  private sendFile(req: Request, res: Response, filePath: string, cacheControl: string): void {
    const mime = MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    res.setHeader('Content-Type', mime)
    res.setHeader('Cache-Control', cacheControl)
    res.setHeader('Vary', 'Accept-Encoding')
    const acceptEncoding = String(req.headers['accept-encoding'] ?? '')
    for (const { encoding, suffix } of PRECOMPRESSED_VARIANTS) {
      const variantPath = `${filePath}${suffix}`
      if (acceptEncoding.includes(encoding) && existsSync(variantPath)) {
        res.setHeader('Content-Encoding', encoding)
        createReadStream(variantPath).pipe(res)
        return
      }
    }
    createReadStream(filePath).pipe(res)
  }

  /**
   * Loads `<webPackage>/dist/standalone/index.html` and bakes in the
   * transformations that don't depend on the request:
   *
   *   1. Rewrites build-time relative `./assets/...` references to absolute
   *      `${mountPath}/assets/...`, so deep links survive.
   *   2. Optionally swaps the document `<title>` and the favicon `<link>`.
   *   3. Adds the pre-paint theme/lang script and any static `themeCss`.
   *
   * The result is cached in memory; per-request config and `headHtml`
   * injection happen later in `renderHtml`.
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
    const { faviconUrl, title } = this.options
    // Unconditionally absolutise every relative `./favicon.svg` reference —
    // the shell may carry more than the one `<link rel="icon">` (an
    // apple-touch-icon, a manifest entry), and any left relative 404s on a
    // deep link like `/admin/resources/users`.
    html = html.replace(/(["'])\.\/favicon\.svg/g, `$1${this.mountPath}/favicon.svg`)
    if (faviconUrl) {
      // Replace the shell's own icon link rather than appending a second
      // one — browsers pick the last, but proxies and crawlers differ.
      html = replaceOrAppendToHead(
        html,
        /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*>/i,
        `<link rel="icon" href="${escapeHtml(faviconUrl)}">`,
      )
    }
    if (title) {
      // Replacer function, not a replacement string: `$&`, "$`" and `$'` in
      // a company name would otherwise be expanded and corrupt the shell.
      html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(title)}</title>`)
    }
    html = appendToHead(html, PRE_PAINT_SCRIPT, { prepend: true })
    if (this.options.themeCss) {
      html = appendToHead(html, `<style>${escapeStyle(this.options.themeCss)}</style>`)
    }
    return html
  }

  private async renderHtml(req: Request): Promise<string> {
    const config = await this.resolveConfig(req)
    const inject = `<script>window.__MODERN_ADMIN__ = ${safeJsonForScript(config)};</script>`
    const head = await this.resolveHeadHtml(req)
    const html = this.htmlTemplate.includes(CONFIG_MARKER)
      ? this.htmlTemplate.replace(CONFIG_MARKER, () => inject)
      : appendToHead(this.htmlTemplate, inject)
    // Host markup goes last, so it wins over everything the framework emits.
    return head ? appendToHead(html, head) : html
  }

  private async resolveConfig(req: Request): Promise<ModernAdminUiRuntimeConfig> {
    const raw = this.options.runtimeConfig
    const userConfig: ModernAdminUiRuntimeConfig = raw
      ? typeof raw === 'function'
        ? ((await raw(req)) as ModernAdminUiRuntimeConfig)
        : raw
      : {}
    // Always inject `basePath` from the mount path so the SPA router knows
    // where it is mounted without any manual configuration by the host app.
    // User-supplied `basePath` in runtimeConfig takes precedence if provided.
    return { basePath: this.mountPath || '/', ...userConfig }
  }

  private async resolveHeadHtml(req: Request): Promise<string> {
    const raw = this.options.headHtml
    if (!raw) return ''
    return typeof raw === 'function' ? await raw(req) : raw
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

/**
 * Normalises the configured mount path and rejects a root mount.
 *
 * `'/'` would strip to `''`, which turns the middleware's exclude into
 * `/api/(.*)` while its routes become `/(.*)`: the admin API lives at the
 * hardcoded `/admin/api/*`, would no longer match the exclude, and every
 * API call — plus every unrelated host GET route — would be answered with
 * the SPA shell. Fail loudly at boot instead.
 */
export function assertMountPath(path: string): string {
  const stripped = stripTrailingSlash(path)
  if (stripped === '') {
    throw new Error(
      '[modern-admin] ModernAdminStaticUiModule cannot be mounted at the root path ("/"): ' +
        'it would shadow the admin API at /admin/api/* and every other GET route in the host app. ' +
        'Use a sub-path such as "/admin".',
    )
  }
  if (!stripped.startsWith('/')) {
    throw new Error(
      `[modern-admin] ModernAdminStaticUiModule "path" must start with "/" (received ${JSON.stringify(path)}).`,
    )
  }
  return stripped
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

function normalizeStaticFiles(files: Record<string, string> | undefined): Map<string, string> {
  const map = new Map<string, string>()
  for (const [urlPath, filePath] of Object.entries(files ?? {})) {
    const key = urlPath.startsWith('/') ? urlPath : `/${urlPath}`
    map.set(key, filePath)
  }
  return map
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

const HEAD_OPEN = /<head(\s[^>]*)?>/i
const HEAD_CLOSE = /<\/head\s*>/i

/**
 * Inserts `markup` into `<head>`, at the end by default. All insertions go
 * through a replacer function so `$&` and friends in host-supplied markup
 * are never expanded.
 *
 * Every fallback appends. Prepending to the document would put a `<script>`
 * ahead of `<!doctype html>`, which drops the whole page into quirks mode —
 * a far worse outcome than a pre-paint script running slightly later.
 */
function appendToHead(html: string, markup: string, opts: { prepend?: boolean } = {}): string {
  if (opts.prepend && HEAD_OPEN.test(html)) {
    return html.replace(HEAD_OPEN, (tag) => `${tag}${markup}`)
  }
  if (HEAD_CLOSE.test(html)) {
    return html.replace(HEAD_CLOSE, (tag) => `${markup}${tag}`)
  }
  if (HEAD_OPEN.test(html)) {
    return html.replace(HEAD_OPEN, (tag) => `${tag}${markup}`)
  }
  return `${html}${markup}`
}

function replaceOrAppendToHead(html: string, pattern: RegExp, markup: string): string {
  return pattern.test(html) ? html.replace(pattern, () => markup) : appendToHead(html, markup)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * `<style>` has raw-text content, so the only sequence that can terminate
 * it early is a literal `</style`. Everything else is legal CSS.
 */
function escapeStyle(css: string): string {
  return css.replace(/<\/(style)/gi, '<\\/$1')
}
