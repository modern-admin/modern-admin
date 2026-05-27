// Browser-side ComponentLoader. Custom property/action components register
// themselves by name and consumers look them up by string. We intentionally
// keep this synchronous (no rollup/runtime bundling) — apps import their
// custom components as ES modules and call `.add()` at startup.

import type * as React from 'react'

// We can't enforce a single prop shape because each registered slot accepts
// different props (display vs editor). The renderer wraps the lookup with a
// concrete prop type, so the loader stays untyped at the entry boundary.

export type ComponentEntry = React.ComponentType<any>

export class ComponentLoader {
  private readonly entries = new Map<string, ComponentEntry>()

  add(name: string, component: ComponentEntry): this {
    this.entries.set(name, component)
    return this
  }

  has(name: string): boolean {
    return this.entries.has(name)
  }

  get(name: string): ComponentEntry | undefined {
    return this.entries.get(name)
  }

  list(): string[] {
    return Array.from(this.entries.keys())
  }
}
