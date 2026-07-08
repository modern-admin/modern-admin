// Isolated re-export of the full lucide-react icon registry (~1,600 icons).
// Kept in its own module so `nav-icon.tsx` can pull it in with a dynamic
// `import()` — the bundler then places the registry in a separate async
// chunk instead of the critical-path bundle. Only individually named icon
// imports (tree-shaken) stay in the main chunk.

export { icons } from 'lucide-react'
