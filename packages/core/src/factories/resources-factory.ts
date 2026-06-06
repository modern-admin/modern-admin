import {
  type BaseDatabase,
  BaseResource,
} from '../adapters'
import {
  ResourceDecorator,
  type ResourceOptions,
} from '../decorators'
import {
  NoDatabaseAdapterError,
  NoResourceAdapterError,
} from '../errors'
import { deepMerge } from '../utils/merge-options.js'

/**
 * Concrete constructor + statics contract for a database adapter class.
 *
 * Intentionally NOT `typeof BaseDatabase`: that is an *abstract*
 * constructor signature, and under TS 6.x stricter variance checks the
 * concrete subclass constructors aren't assignable to it without an
 * `as unknown as` cast at every adapter registration site. We use `any`
 * in constructor input position so adapter classes with narrow ctor
 * params (e.g. `new (cfg: InMemoryDb)`) remain assignable — constructor
 * args are validated at runtime by the preceding `isAdapterFor(...)`
 * check, so the static type is not load-bearing here.
 */
export interface DatabaseClass {

  new (db: any): BaseDatabase
  isAdapterFor(db: unknown): boolean
}

/** Concrete constructor + statics contract for a resource adapter class. */
export interface ResourceClass {

  new (raw: any): BaseResource
  isAdapterFor(raw: unknown): boolean
}

export interface Adapter {
  Database: DatabaseClass
  Resource: ResourceClass
}

export type FeatureFn = (options: ResourceOptions) => ResourceOptions

export interface ResourceWithOptions {
  resource: unknown
  options?: ResourceOptions
  features?: FeatureFn[]
}

/**
 * Process-wide plugin contract: applied to **every** registered resource
 * unless filtered out by `include` / `exclude` (matched against the
 * resource id — `options.id` if provided, otherwise `resource.id()`).
 *
 * Use this for cross-cutting concerns like action logging, audit trails,
 * realtime broadcast, etc., where the same transformation should apply
 * uniformly across the admin instance. For per-resource transformations,
 * use a local `FeatureFn` via `ResourceWithOptions.features`.
 *
 * Local features run first; global plugins run after; user-supplied
 * `options` are merged on top last (so user overrides win).
 */
export interface GlobalPlugin {
  /** Optional human-readable id for diagnostics. */
  name?: string
  /** Whitelist: only apply to these resource ids. Omit to apply to all. */
  include?: string[]
  /** Blacklist: skip these resource ids. */
  exclude?: string[]
  /** Transformation applied to the (already feature-merged) options. */
  apply: (options: ResourceOptions, resource: BaseResource) => ResourceOptions
}

export interface BuildResourcesArgs {
  databases?: unknown[]
  resources?: Array<unknown | ResourceWithOptions>
  adapters: Adapter[]
  plugins?: GlobalPlugin[]
}

const isResourceWithOptions = (raw: unknown): raw is ResourceWithOptions =>
  typeof raw === 'object' && raw !== null && 'resource' in raw

export class ResourcesFactory {
  static buildResources(args: BuildResourcesArgs): BaseResource[] {
    const { databases = [], resources = [], adapters, plugins = [] } = args

    const fromOptions = ResourcesFactory.convertResources(resources, adapters)
    const optionIds = new Set(fromOptions.map((r) => r.resource.id()))

    const fromDatabasesAll = ResourcesFactory.convertDatabases(databases, adapters)
    const fromDatabases = fromDatabasesAll.filter((r) => !optionIds.has(r.id()))

    // Diagnostic: both sources populated but no id overlap. Typically
    // happens when `@AdminResource` registrations remap to logical ids
    // (e.g. `customers`) while `databases:` auto-emits the same models
    // under raw names (`Customer`). Both sets then end up registered in
    // parallel, surfacing as duplicates in dropdowns/dashboards. Honest
    // false-positives exist (e.g. `databases:` auto-discovery + one
    // unrelated custom resource via `resources:`) — emit `console.warn`
    // rather than throw so the user can ignore if intentional.
    if (
      fromDatabasesAll.length > 0 &&
      fromOptions.length > 0 &&
      fromDatabases.length === fromDatabasesAll.length
    ) {
      const dbIds = fromDatabasesAll.map((r) => r.id())
      const optIds = fromOptions.map((r) => r.resource.id())

      console.warn(
        `[modern-admin] Registered ${dbIds.length} resource(s) from \`databases:\` ` +
        `(ids: ${dbIds.join(', ')}) and ${optIds.length} from \`resources:\`/\`@AdminResource\` ` +
        `(ids: ${optIds.join(', ')}) with no id overlap. If your @AdminResource ` +
        `registrations remap to logical ids, the \`databases:\` entries will register ` +
        `a second, parallel set of resources under raw model names — usually a bug ` +
        `(duplicates in dropdowns, dashboards). Remove \`databases:\` to register ` +
        `resources only via @AdminResource, or align ids if you intend both.`,
      )
    }

    const merged = [
      ...fromDatabases.map((resource) => ({ resource, options: {} as ResourceOptions, features: [] as FeatureFn[] })),
      ...fromOptions,
    ]
    return ResourcesFactory.decorate(merged, plugins)
  }

  private static convertDatabases(databases: unknown[], adapters: Adapter[]): BaseResource[] {
    const result: BaseResource[] = []
    for (const db of databases) {
      const adapter = adapters.find((a) => a.Database.isAdapterFor(db))
      if (!adapter) throw new NoDatabaseAdapterError(db)
      const dbInstance = new adapter.Database(db)
      result.push(...dbInstance.resources())
    }
    return result
  }

  private static convertResources(
    resources: Array<unknown | ResourceWithOptions>,
    adapters: Adapter[],
  ): Array<{ resource: BaseResource; options: ResourceOptions; features: FeatureFn[] }> {
    return resources.map((raw) => {
      const wrapped = isResourceWithOptions(raw) ? raw : { resource: raw }
      const target = wrapped.resource
      if (target instanceof BaseResource) {
        return {
          resource: target,
          options: wrapped.options ?? {},
          features: wrapped.features ?? [],
        }
      }
      const adapter = adapters.find((a) => a.Resource.isAdapterFor(target))
      if (!adapter) throw new NoResourceAdapterError(target)
      const instance = new adapter.Resource(target)
      return {
        resource: instance,
        options: wrapped.options ?? {},
        features: wrapped.features ?? [],
      }
    })
  }

  private static decorate(
    items: Array<{ resource: BaseResource; options: ResourceOptions; features: FeatureFn[] }>,
    plugins: GlobalPlugin[] = [],
  ): BaseResource[] {
    return items.map(({ resource, options, features }) => {
      const fromFeatures = features.reduce<ResourceOptions>(
        (opts, feature) => feature(opts),
        {},
      )

      // Apply global plugins after local features but before user options,
      // so explicit ResourceOptions can still override plugin choices.
      const candidateId = options.id ?? resource.id()
      const fromPlugins = plugins.reduce<ResourceOptions>((opts, plugin) => {
        if (plugin.exclude?.includes(candidateId)) return opts
        if (plugin.include && !plugin.include.includes(candidateId)) return opts
        return plugin.apply(opts, resource)
      }, fromFeatures)

      const merged = deepMerge(fromPlugins, options)
      const decorator = new ResourceDecorator(resource, merged)
      resource.assignDecorator(decorator)
      return resource
    })
  }
}
