// @modern-admin/core — universal admin panel core abstractions.

export const VERSION = '0.0.0'

// Adapters
export {
  BaseDatabase,
  BaseResource,
  BaseProperty,
  BaseRecord,
  type AggregationOp,
  type AggregationRequest,
  type AggregationResult,
  type BasePropertyAttrs,
  type FindOptions,
  type ParamsType,
  type PropertyType,
  type RecordJSON,
  type SortDirection,
  type StreamOptions,
} from './adapters'

// Filter
export {
  Filter,
  MATCHING_PATTERNS,
  PARAM_SEPARATOR,
  type FilterElement,
  type FilterValue,
  type RawFilters,
} from './filter'

// Decorators
export {
  PropertyDecorator,
  ActionDecorator,
  ResourceDecorator,
  propertyOptionsZ,
  propertyVisibilityZ,
  propertyComponentsZ,
  actionOptionsZ,
  resourceOptionsZ,
  type PropertyOptions,
  type PropertyVisibility,
  type PropertyComponents,
  type ActionOptions,
  type ResourceOptions,
} from './decorators'

// Actions
export {
  BUILT_IN_ACTIONS,
  listAction,
  showAction,
  newAction,
  editAction,
  deleteAction,
  bulkDeleteAction,
  searchAction,
  type Action,
  type ActionContext,
  type ActionDescriptor,
  type ActionHandler,
  type ActionRequest,
  type ActionResponse,
  type ActionType,
  type After,
  type Before,
  type BuiltInActionName,
  type BulkActionResponse,
  type IsFunction,
  type ListActionResponse,
  type NoticeMessage,
  type RecordActionResponse,
} from './actions'

// Ports / plugin contracts
export {
  AnonymousAuthProvider,
  ComponentLoader,
  InMemoryRealtimeBus,
  NoopCacheProvider,
  NoopRealtimeBus,
  type CacheSetOptions,
  type ComponentLoaderEntry,
  type CurrentAdmin,
  type IAuthProvider,
  type ICacheProvider,
  type IComponentLoader,
  type IRealtimeBus,
  type LoginCredentials,
  type RealtimeEvent,
  type RealtimeHandler,
} from './ports'

// Errors
export {
  ActionNotFoundError,
  ForbiddenError,
  NoDatabaseAdapterError,
  NoResourceAdapterError,
  NotImplementedError,
  RecordNotFoundError,
  ResourceNotFoundError,
  ValidationError,
  type PropertyErrors,
  type RecordError,
} from './errors'

// Factories & main class
export {
  ResourcesFactory,
  type Adapter,
  type FeatureFn,
  type ResourceWithOptions,
} from './factories/resources-factory.js'
export { ModernAdmin, ACTIONS, type ModernAdminOptions } from './modern-admin.js'
