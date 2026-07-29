/**
 * Vite config kit for apps that build their own copy of the admin SPA.
 *
 * The prebuilt `@modern-admin/web` standalone bundle registers no custom
 * components, so any app that uses `component: '…'` on an action or
 * `components: { edit: '…' }` on a property has to build its own bundle. That
 * bundle has to match what `@modern-admin/nest`'s StaticUiMiddleware expects
 * — `dist/standalone/{index.html,assets/**}` with relative `./assets/` URLs —
 * which used to mean copying this package's `vite.config.ts` wholesale.
 *
 *   // vite.config.ts
 *   import { defineAdminAppConfig } from '@modern-admin/web/vite'
 *   export default defineAdminAppConfig({ apiProxy: 'http://localhost:3011' })
 *
 *   // src/main.tsx
 *   import { mount, readWindowConfig } from '@modern-admin/web'
 *   import './styles.css'
 *   mount(document.getElementById('root')!, {
 *     config: readWindowConfig(),
 *     components: new ComponentLoader().add('SendPushForm', SendPushForm),
 *   })
 *
 * `packages/web/vite.config.ts` consumes this same factory, so the kit can't
 * drift from the bundle we ship.
 */

import path from 'node:path'
import { promises as fs } from 'node:fs'
import { promisify } from 'node:util'
import zlib from 'node:zlib'
import type { ConfigEnv, Plugin, PluginOption, UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { ModernAdminRuntimeConfig } from './runtime-config.js'

const brotli = promisify(zlib.brotliCompress)
const gzip = promisify(zlib.gzip)

/** Layout StaticUiMiddleware resolves as `<webPackage>/dist/standalone`. */
const STANDALONE_OUT_DIR = 'dist/standalone'

export interface AdminAppConfigOptions {
  /** Dev server port. Defaults to `WEB_PORT`, then 3000. */
  port?: number
  /**
   * Origin of the NestJS admin API, proxied during `vite dev` so the SPA and
   * the API stay same-origin and session cookies work (e.g.
   * `http://localhost:3011`). Omit if you serve both yourself.
   */
  apiProxy?: string
  /**
   * Path prefixes forwarded to `apiProxy`. Defaults to the REST/auth prefix
   * every `@modern-admin/nest` controller lives under plus the socket.io
   * endpoint used by `@modern-admin/realtime`.
   */
  apiProxyPath?: string | string[]
  /**
   * Runtime config for `vite dev` only. In production the host server
   * injects `window.__MODERN_ADMIN__` into the shell, so there is nothing to
   * configure at build time — this fills the same slot while developing.
   */
  devConfig?: ModernAdminRuntimeConfig
  /** Directory the standalone build writes to. Rarely worth changing. */
  outDir?: string
  /** Extra plugins, appended after the built-in ones. */
  plugins?: PluginOption[]
}

/**
 * Emits `.br` and `.gz` siblings next to every compressible standalone
 * asset. StaticUiMiddleware serves whichever variant the browser's
 * `Accept-Encoding` allows and falls back to the plain file, so this is an
 * optimisation rather than a correctness requirement.
 */
export function precompressPlugin(outDir = STANDALONE_OUT_DIR): Plugin {
  const COMPRESSIBLE = new Set(['.js', '.mjs', '.css', '.html', '.svg', '.json'])
  const MIN_SIZE = 1024
  return {
    name: 'modern-admin:precompress',
    apply: 'build',
    async writeBundle(options) {
      const dir = options.dir ?? path.resolve(process.cwd(), outDir)
      const walk = async (d: string): Promise<string[]> => {
        const entries = await fs.readdir(d, { withFileTypes: true })
        const nested = await Promise.all(
          entries.map((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])),
        )
        return nested.flat()
      }
      const files = (await walk(dir)).filter((f) => COMPRESSIBLE.has(path.extname(f)))
      await Promise.all(
        files.map(async (file) => {
          const source = await fs.readFile(file)
          if (source.length < MIN_SIZE) return
          const [br, gz] = await Promise.all([
            brotli(source, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }),
            gzip(source, { level: zlib.constants.Z_BEST_COMPRESSION }),
          ])
          await Promise.all([fs.writeFile(`${file}.br`, br), fs.writeFile(`${file}.gz`, gz)])
        }),
      )
    },
  }
}

/**
 * Injects low-priority `<link rel="prefetch">` hints for the lazy chunks a
 * fresh session is almost certain to need right after the shell renders:
 * the dashboard landing page, the full icon registry (sidebar), and the
 * resource list page + property renderer (first sidebar click). The browser
 * fetches them during idle time instead of on first navigation, without
 * competing with the critical-path entry chunk. Relative `./assets/` hrefs
 * are rewritten to the mount path by StaticUiMiddleware like every other
 * asset reference.
 */
export function prefetchHintsPlugin(): Plugin {
  const PREFETCH_CHUNKS = new Set(['home-page', 'icon-registry', 'list-page', 'property-renderer'])
  return {
    name: 'modern-admin:prefetch-hints',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const chunks = Object.values(ctx.bundle ?? {}).filter(
          (out) => out.type === 'chunk' && out.name && PREFETCH_CHUNKS.has(out.name),
        )
        return chunks.map((chunk) => ({
          tag: 'link',
          attrs: { rel: 'prefetch', as: 'script', href: `./${chunk.fileName}` },
          injectTo: 'head' as const,
        }))
      },
    },
  }
}

/**
 * Injects `window.__MODERN_ADMIN__` while developing. In production the same
 * slot is filled per-request by the host server (StaticUiMiddleware replaces
 * the `<!--MODERN_ADMIN_CONFIG-->` marker, or falls back to `</head>`), so
 * this plugin is dev-only and never affects the built bundle.
 */
export function devRuntimeConfigPlugin(config: ModernAdminRuntimeConfig): Plugin {
  return {
    name: 'modern-admin:dev-runtime-config',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler() {
        // `</script>` inside the JSON would close the tag early.
        const json = JSON.stringify(config).replace(/</g, '\\u003c')
        return [
          {
            tag: 'script',
            children: `window.__MODERN_ADMIN__ = ${json};`,
            injectTo: 'head-prepend' as const,
          },
        ]
      },
    },
  }
}

/**
 * `ws: true` so the realtime gateway's socket.io upgrade survives the proxy;
 * `changeOrigin` keeps the session cookie's Origin check happy.
 */
function buildProxy(
  target: string,
  paths: string | string[],
): Record<string, { target: string; changeOrigin: boolean; ws: boolean }> {
  const list = Array.isArray(paths) ? paths : [paths]
  return Object.fromEntries(list.map((p) => [p, { target, changeOrigin: true, ws: true }]))
}

/**
 * Builds the Vite config for a custom admin SPA. Pass the result straight to
 * `export default` — it resolves `vite dev` and `vite build` itself, so no
 * `--mode` flag is required.
 */
export function defineAdminAppConfig(
  options: AdminAppConfigOptions = {},
): (env: ConfigEnv) => UserConfig {
  const {
    apiProxy,
    apiProxyPath = ['/admin/api', '/socket.io'],
    devConfig,
    outDir = STANDALONE_OUT_DIR,
    plugins: extraPlugins = [],
  } = options
  return ({ command }) => {
    const shared: PluginOption[] = [react(), tailwindcss()]
    if (command === 'build') {
      return {
        plugins: [...shared, precompressPlugin(outDir), prefetchHintsPlugin(), ...extraPlugins],
        // Relative base so one bundle can be mounted under any path — the
        // host server rewrites `./assets/` to its own mount prefix.
        base: './',
        build: {
          outDir,
          emptyOutDir: true,
          sourcemap: true,
        },
      }
    }
    return {
      plugins: [
        ...shared,
        ...(devConfig ? [devRuntimeConfigPlugin(devConfig)] : []),
        ...extraPlugins,
      ],
      server: {
        port: options.port ?? Number(process.env.WEB_PORT ?? 3000),
        host: true,
        ...(apiProxy ? { proxy: buildProxy(apiProxy, apiProxyPath) } : {}),
      },
    }
  }
}
