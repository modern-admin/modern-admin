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

export interface BuildResourcesArgs {
  databases?: unknown[]
  resources?: Array<unknown | ResourceWithOptions>
  adapters: Adapter[]
}

const isResourceWithOptions = (raw: unknown): raw is ResourceWithOptions =>
  typeof raw === 'object' && raw !== null && 'resource' in raw

export class ResourcesFactory {
  static buildResources(args: BuildResourcesArgs): BaseResource[] {
    const { databases = [], resources = [], adapters } = args

    const fromOptions = ResourcesFactory.convertResources(resources, adapters)
    const optionIds = new Set(fromOptions.map((r) => r.resource.id()))

    const fromDatabases = ResourcesFactory.convertDatabases(databases, adapters).filter(
      (r) => !optionIds.has(r.id()),
    )

    const merged = [
      ...fromDatabases.map((resource) => ({ resource, options: {} as ResourceOptions, features: [] as FeatureFn[] })),
      ...fromOptions,
    ]
    return ResourcesFactory.decorate(merged)
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
  ): BaseResource[] {
    return items.map(({ resource, options, features }) => {
      const fromFeatures = features.reduce<ResourceOptions>(
        (opts, feature) => feature(opts),
        {},
      )
      const merged = deepMerge(fromFeatures, options)
      const decorator = new ResourceDecorator(resource, merged)
      resource.assignDecorator(decorator)
      return resource
    })
  }
}
