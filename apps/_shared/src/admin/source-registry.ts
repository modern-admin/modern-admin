// Source registry — bridges shared `@AdminResource` controllers to the
// adapter-specific raw source object each host app provides.
//
// Why this exists: `@AdminResource({ source: () => ... })` evaluates the
// thunk during ResourcesFactory.buildResources, by which time the host
// app must have produced the right raw value for its adapter:
//
//   • InMemory app  → `{ name, properties, rows }` (an InMemoryTable)
//   • Prisma app    → `{ model, client, dmmf? }`   (a PrismaResourceConfig)
//
// Shared controllers reference resources by *logical* id (`'customers'`,
// `'posts'`, …). Each app calls `registerAdminSource(id, factory)` once
// at module-load time; controllers then declare
// `source: () => adminSource('customers')` and the registry hands back
// the adapter-specific object.

export type AdminSourceFactory = () => unknown

const registry = new Map<string, AdminSourceFactory>()

/**
 * Register a factory that produces the adapter-specific raw source for
 * a logical resource id. Must be called before NestJS bootstrap so that
 * the source is available when ResourcesFactory builds resources.
 */
export const registerAdminSource = (id: string, factory: AdminSourceFactory): void => {
  registry.set(id, factory)
}

/** Bulk-register helper for app boot code. */
export const registerAdminSources = (entries: Record<string, AdminSourceFactory>): void => {
  for (const [id, factory] of Object.entries(entries)) {
    registry.set(id, factory)
  }
}

/**
 * Resolve the registered factory and invoke it. Used inside
 * `@AdminResource({ source: () => adminSource('id') })`.
 */
export const adminSource = (id: string): unknown => {
  const factory = registry.get(id)
  if (!factory) {
    throw new Error(
      `[admin] no source registered for resource "${id}". ` +
        `Call registerAdminSource("${id}", ...) before NestJS bootstrap ` +
        `(typically in your admin.module.ts top-level code).`,
    )
  }
  return factory()
}

/** Inspect/clear (tests). */
export const hasAdminSource = (id: string): boolean => registry.has(id)
export const clearAdminSources = (): void => registry.clear()
