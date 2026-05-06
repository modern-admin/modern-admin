/**
 * ComponentLoader registers custom React components by name. Unlike AdminJS,
 * we do NOT bundle at runtime — the frontend (Vite/TanStack Start) handles
 * code-splitting via dynamic imports. The loader simply maintains the
 * name → loader map; consumers resolve at render-time.
 */
export type ComponentLoaderEntry = () => Promise<{ default: unknown }>

export interface IComponentLoader {
  add(name: string, loader: ComponentLoaderEntry): this
  override(name: string, loader: ComponentLoaderEntry): this
  has(name: string): boolean
  get(name: string): ComponentLoaderEntry | undefined
  entries(): ReadonlyArray<readonly [string, ComponentLoaderEntry]>
}

export class ComponentLoader implements IComponentLoader {
  private readonly registry = new Map<string, ComponentLoaderEntry>()

  add(name: string, loader: ComponentLoaderEntry): this {
    if (this.registry.has(name)) {
      throw new Error(
        `Component "${name}" already registered. Use override() to replace it.`,
      )
    }
    this.registry.set(name, loader)
    return this
  }

  override(name: string, loader: ComponentLoaderEntry): this {
    this.registry.set(name, loader)
    return this
  }

  has(name: string): boolean {
    return this.registry.has(name)
  }

  get(name: string): ComponentLoaderEntry | undefined {
    return this.registry.get(name)
  }

  entries(): ReadonlyArray<readonly [string, ComponentLoaderEntry]> {
    return Array.from(this.registry.entries())
  }
}
