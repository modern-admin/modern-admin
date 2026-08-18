import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // ProseMirror relies on class identity. Bun's isolated linker may expose
  // one version through multiple store paths unless Vite deduplicates it.
  resolve: {
    dedupe: [
      'prosemirror-changeset',
      'prosemirror-commands',
      'prosemirror-dropcursor',
      'prosemirror-gapcursor',
      'prosemirror-history',
      'prosemirror-inputrules',
      'prosemirror-keymap',
      'prosemirror-model',
      'prosemirror-schema-list',
      'prosemirror-state',
      'prosemirror-tables',
      'prosemirror-transform',
      'prosemirror-view',
    ],
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 3000),
    host: true,
  },
})
