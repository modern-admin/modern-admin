// Icon-by-name renderer backed by the full lucide-react registry, loaded
// lazily. Any icon the library ships can be referenced from a resource's
// `navigation.icon` (canonical PascalCase name, e.g. `ShieldCheck`,
// `FolderKanban`) — no curated allow-list to keep in sync. Unknown names
// fall back to `Database`.
//
// The registry weighs ~800 KB, so it must never sit on the critical path:
// the first render shows the `Database` fallback, the registry chunk loads
// in the background, and subscribed `NavIcon`s re-render once it lands.

import * as React from 'react'
import { Database, type LucideProps } from 'lucide-react'

type IconComponent = React.ComponentType<LucideProps>

type IconRegistry = Record<string, IconComponent>

let registry: IconRegistry | null = null
let registryPromise: Promise<void> | null = null
const listeners = new Set<() => void>()

function loadRegistry(): Promise<void> {
  registryPromise ??= import('./icon-registry.js').then((m) => {
    registry = m.icons as IconRegistry
    for (const notify of listeners) notify()
  })
  return registryPromise
}

const subscribe = (notify: () => void): (() => void) => {
  listeners.add(notify)
  return () => listeners.delete(notify)
}

const getRegistry = (): IconRegistry | null => registry

export function NavIcon({ name, className }: { name?: string; className?: string }): React.ReactElement {
  const icons = React.useSyncExternalStore(subscribe, getRegistry, getRegistry)
  React.useEffect(() => {
    if (name && !registry) void loadRegistry()
  }, [name])
  const Icon: IconComponent = (name && icons?.[name]) || Database
  return <Icon className={className} />
}
