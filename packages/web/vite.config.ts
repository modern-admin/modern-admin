/**
 * Two-mode build:
 *
 *   bun run build:lib         → dist/lib/   (ESM library — `mount()` API)
 *   bun run build:standalone  → dist/standalone/ (Prebuilt SPA + index.html)
 *
 * `mode` is set by Vite from the `--mode` CLI flag. Other modes (dev,
 * preview) get the standalone SPA config — that's what you serve from
 * `bun run dev`.
 */

import { defineConfig, type Plugin, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import dts from 'vite-plugin-dts'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { promisify } from 'node:util'
import zlib from 'node:zlib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const brotli = promisify(zlib.brotliCompress)
const gzip = promisify(zlib.gzip)

/**
 * Emits `.br` and `.gz` siblings next to every compressible standalone
 * asset. `@modern-admin/nest`'s StaticUiMiddleware picks whichever variant
 * the browser's `Accept-Encoding` allows — no runtime compression cost.
 * Sourcemaps are skipped (fetched only with devtools open) and so are
 * files that compression wouldn't meaningfully shrink.
 */
function precompressPlugin(): Plugin {
  const COMPRESSIBLE = new Set(['.js', '.mjs', '.css', '.html', '.svg', '.json'])
  const MIN_SIZE = 1024
  return {
    name: 'modern-admin:precompress',
    apply: 'build',
    async writeBundle(options) {
      const dir = options.dir ?? path.resolve(__dirname, 'dist/standalone')
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

// External deps for the library build — host apps provide their own copy
// (deduped by the workspace / package manager). The standalone SPA bundle
// inlines all of these so the served `<script>` is self-contained.
const LIB_EXTERNALS = [
  'react',
  'react-dom',
  'react-dom/client',
  /^react\//,
  /^react-dom\//,
  /^@modern-admin\//,
  /^@tanstack\//,
  /^@radix-ui\//,
  /^lucide-react/,
  /^@hookform\//,
  /^react-hook-form/,
  'zod',
  'class-variance-authority',
  'clsx',
  'tailwind-merge',
  'cmdk',
  'sonner',
  'date-fns',
  'react-day-picker',
  /^@tiptap\//,
  'tiptap-markdown',
  'dompurify',
  'marked',
  'recharts',
  'tw-animate-css',
]

const libConfig: UserConfig = {
  plugins: [
    react(),
    tailwindcss(),
    dts({
      entryRoot: 'src',
      outDirs: 'dist/lib',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/standalone.tsx'],
    }),
  ],
  // Don't copy public/ (favicon.svg etc.) into the library output — those
  // assets only make sense for the standalone HTML build.
  publicDir: false,
  build: {
    outDir: 'dist/lib',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: LIB_EXTERNALS,
    },
  },
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
function prefetchHintsPlugin(): Plugin {
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

const standaloneConfig: UserConfig = {
  plugins: [react(), tailwindcss(), precompressPlugin(), prefetchHintsPlugin()],
  // Relative base so the same bundle can be mounted under any path
  // (e.g. `/admin/`) — the server rewrites asset URLs in index.html.
  base: './',
  build: {
    outDir: 'dist/standalone',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
    },
  },
}

const devConfig: UserConfig = {
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.WEB_PORT ?? 3000),
    host: true,
  },
}

export default defineConfig(({ mode }) => {
  if (mode === 'lib') return libConfig
  if (mode === 'standalone') return standaloneConfig
  return devConfig
})
