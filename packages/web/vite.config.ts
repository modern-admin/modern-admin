/**
 * Two-mode build:
 *
 *   bun run build:lib         → dist/lib/   (ESM library — `mount()` API)
 *   bun run build:standalone  → dist/standalone/ (Prebuilt SPA + index.html)
 *
 * `mode` is set by Vite from the `--mode` CLI flag. Other modes (dev,
 * preview) get the standalone SPA config — that's what you serve from
 * `bun run dev`.
 *
 * The standalone/dev half is `defineAdminAppConfig()` from `src/vite.ts`,
 * i.e. the very config we hand to apps that build their own bundle
 * (`@modern-admin/web/vite`). Dogfooding it here is what stops the two from
 * drifting apart.
 */

import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import dts from 'vite-plugin-dts'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { defineAdminAppConfig } from './src/vite.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
      exclude: ['src/standalone.tsx', 'src/vite.ts'],
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

// `vite build --mode standalone` arrives as command 'build'; `vite` and
// `vite preview` as 'serve'. Rollup's input defaults to `<root>/index.html`,
// which is exactly the shell this package ships.
const adminApp = defineAdminAppConfig()

export default defineConfig((env) => (env.mode === 'lib' ? libConfig : adminApp(env)))
