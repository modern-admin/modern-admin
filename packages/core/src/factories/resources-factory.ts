import {
  BaseDatabase,
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

export interface Adapter {
  Database: typeof BaseDatabase
  Resource: typeof BaseResource
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

    const fromDatabases = ResourcesFactory.convertDatabases(databases, adapters).filter(
      (r) => !optionIds.has(r.id()),
    )

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
      const dbInstance = new (adapter.Database as unknown as new (db: unknown) => BaseDatabase)(db)
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
      const instance = new (adapter.Resource as unknown as new (raw: unknown) => BaseResource)(target)
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
