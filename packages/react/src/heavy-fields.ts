// Re-export of heavyweight field editors, isolated so `property-renderer.tsx`
// can pull them in with a dynamic `import()`. The tiptap-based richtext
// editor drags in the whole @tiptap ecosystem — behind this boundary the
// bundler places it in its own async chunk, fetched only when a form with a
// richtext/markdown property actually renders. Keep this module free of
// anything needed on the critical path.

export { RichtextEditor } from '@modern-admin/ui'
