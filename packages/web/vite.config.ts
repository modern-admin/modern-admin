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

import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import dts from 'vite-plugin-dts'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

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

const standaloneConfig: UserConfig = {
  plugins: [react(), tailwindcss()],
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
