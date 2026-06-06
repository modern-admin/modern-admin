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
  type TimeSeriesPoint,
  type TimeSeriesQuery,
  type TimeSeriesResult,
  type TimeSeriesSeries,
  type TimeSeriesStep,
} from './adapters'

// Filter
export {
  Filter,
  FILTER_OPERATORS,
  MATCHING_PATTERNS,
  PARAM_SEPARATOR,
  parseOperatorValue,
  type FilterElement,
  type FilterOperator,
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
  showWhenZ,
  keyValueFieldZ,
  actionOptionsZ,
  resourceOptionsZ,
  relatedResourceZ,
  cacheActionOptionsZ,
  cacheOptionsZ,
  cacheOptionsObjectZ,
  cacheStrategyZ,
  resolveResourceCacheConfig,
  TAG_ONLY_TTL_SECONDS,
  DEFAULT_TTL_SECONDS,
  type PropertyOptions,
  type PropertyContextBase,
  type PropertyContext,
  type PropertyAccessFunction,
  type PropertyJSON,
  type ResourceJSON,
  type PropertyVisibility,
  type PropertyComponents,
  type ShowWhen,
  type KeyValueField,
  type ActionOptions,
  type ResourceOptions,
  type RelatedResource,
  type CacheActionOptions,
  type CacheOptions,
  type CacheStrategy,
  type CacheReadAction,
  type ResolvedCacheConfig,
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
  normalizeActionNesting,
  searchAction,
  CacheRuntime,
  listTag,
  recordTag,
  type CacheRuntimeReadOptions,
  type Action,
  type ActionContext,
  type ActionDescriptor,
  type ActionGroup,
  type ActionHandler,
  type ActionNesting,
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
  MemoryCacheProvider,
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
  type DatabaseClass,
  type ResourceClass,
  type FeatureFn,
  type GlobalPlugin,
  type ResourceWithOptions,
} from './factories/resources-factory.js'
export {
  ModernAdmin,
  ACTIONS,
  permissionsAllow,
  type AdminFeatures,
  type ModernAdminJSON,
  type ModernAdminOptions,
  type RegisterResourcesArgs,
  type RolePermissions,
} from './modern-admin.js'

// Dashboard / chart-builder schemas + storage port
export {
  chartVisualisationZ,
  aggregationOpZ,
  aggregationStepZ,
  timeRangePresetZ,
  timeRangeZ,
  chartWidthZ,
  chartDefZ,
  chartGroupZ,
  dashboardBlobZ,
  EMPTY_DASHBOARD,
  type ChartVisualisation,
  type AggregationOpName,
  type AggregationStep,
  type TimeRangePreset,
  type TimeRange,
  type ChartWidth,
  type ChartDef,
  type ChartDefInput,
  type ChartGroup,
  type ChartGroupInput,
  type DashboardBlob,
  type IDashboardStore,
} from './dashboard/store.js'

// System subsystems — action logs, webhooks, config, history, AI tasks,
// and SQL cache. Ports + Zod entry schemas + in-memory defaults; concrete
// adapters live in `@modern-admin/system-prisma` and
// `@modern-admin/system-drizzle`.
export * from './system'

// Diff utilities — shared between feature-history (server-side, snapshot
// computation) and the React revisions UI (client-side, side-by-side view).
export {
  computeFieldDiff,
  diffSnapshots,
  omitFields,
  stableStringify,
  valuesEqual,
  type FieldDiffEntry,
} from './diff'

// UUID v7 generator — see `CLAUDE.md` → "Identifier policy".
export { uuidv7 } from './utils/uuid.js'

// Commercial feature-flag registry. Populated by `new ModernAdmin({
// featureFlags })`, consulted by `@modern-admin-pro/*` packages to gate
// their `apply()` bodies.
export {
  setActiveFeatureFlags,
  isFeatureActive,
  getActiveFeatureFlags,
} from './feature-flags.js'

// `unflatten` converts BaseRecord's internal flat dot-notation params back
// to a nested object. Exposed so features (e.g. feature-history) can
// normalise pre-mutation snapshots to the same shape that `toJSON()`
// emits on the response, keeping diffs symmetric.
export { unflatten } from './utils/flat.js'
