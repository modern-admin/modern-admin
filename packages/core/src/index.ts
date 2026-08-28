// @modern-admin/core — universal admin panel core abstractions.

/**
 * Package version.
 *
 * Two layers, so this is correct with or without build tooling:
 *
 * 1. `FALLBACK_VERSION` tracks `package.json#version`. The release versioning
 *    script updates it alongside the workspace manifests. It is what
 *    ships if nothing substitutes anything — which is what happened before:
 *    the constant was a bare `'0.0.0'` literal, so a 0.5.0 package reported
 *    version zero to every consumer that read it.
 * 2. A bundler `define` for `__MODERN_ADMIN_VERSION__` (tsup/Vite `define`,
 *    esbuild `--define:`) overrides it for anyone who wires it up.
 *
 * `typeof` on an undeclared global is safe in JS, so running straight from
 * source (tests, ts-node) never throws here.
 */
declare const __MODERN_ADMIN_VERSION__: string | undefined

/** Synced from `package.json#version` by `scripts/sync-lock-workspace-versions.ts`. */
const FALLBACK_VERSION = '0.8.0'

export const VERSION: string =
  typeof __MODERN_ADMIN_VERSION__ === 'string' ? __MODERN_ADMIN_VERSION__ : FALLBACK_VERSION

// Adapters
export {
  BaseDatabase,
  BaseResource,
  BaseProperty,
  BaseRecord,
  buildDisplaySql,
  coerceScalar,
  isoDate,
  isRangeValue,
  parseBetween,
  stringifyKey,
  sumValues,
  toDate,
  toNumber,
  truncateDate,
  DEFAULT_TIME_SERIES_ROW_CAP,
  type AggregationOp,
  type AggregationRequest,
  type AggregationResult,
  type BasePropertyAttrs,
  type CoercibleProperty,
  type FindOptions,
  type ParamsType,
  type PropertyType,
  type RecordJSON,
  type SortDirection,
  type SqlDialect,
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
  valuesAction,
  CacheRuntime,
  CACHE_KEY_VERSION,
  cacheKey,
  listCacheKey,
  listTag,
  recordCacheKey,
  recordTag,
  recordsTag,
  rolePermissionsTag,
  searchCacheKey,
  stableCacheStringify,
  type CacheMetricCounters,
  type CacheReadStatus,
  type CacheRuntimeOptions,
  type CacheRuntimeReadOptions,
  type CacheRuntimeStats,
  type CacheStatsEntry,
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
  CACHE_INVALIDATION_CHANNEL,
  ComponentLoader,
  CrossInstanceCacheProvider,
  ConsoleLogger,
  InMemoryRealtimeBus,
  MemoryCacheProvider,
  MODERN_ADMIN,
  NoopCacheProvider,
  NoopRealtimeBus,
  withCrossInstanceInvalidation,
  type CacheSetOptions,
  type CacheTagEpochs,
  type ComponentLoaderEntry,
  type CurrentAdmin,
  type IAuthProvider,
  type ICacheProvider,
  type ILogger,
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

// Media generation provider port + wire schemas
export {
  mediaGenerationCatalogModelZ,
  mediaGenerationCatalogParamZ,
  estimateMediaGenerationPrice,
  mediaGenerationFileTypeZ,
  mediaGenerationFileZ,
  mediaGenerationResultZ,
  mediaGenerationStatusZ,
  type IMediaGenerationProvider,
  type MediaGenerationCatalogModel,
  type MediaGenerationCatalogParam,
  type MediaGenerationCreateInput,
  type MediaGenerationFile,
  type MediaGenerationFileType,
  type MediaGenerationProviderRequestOptions,
  type MediaGenerationResult,
  type MediaGenerationStatus,
} from './media-generation.js'

// Dashboard / chart-builder schemas + storage port
export {
  chartVisualisationZ,
  aggregationOpZ,
  aggregationStepZ,
  timeRangePresetZ,
  timeRangeZ,
  chartWidthZ,
  chartTransformStepZ,
  chartFormatZ,
  seriesStyleZ,
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
  type ChartTransformStep,
  type ChartFormat,
  type SeriesStyle,
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

// Timezone-stable date parsing. Adapters resolve wire strings with this
// instead of bare `new Date(...)`, so an offset-less date-time means UTC
// rather than "whatever `TZ` the server happens to run under".
export { parseDateValue } from './utils/date.js'

// Action-hook chaining helpers. Resource features append `before`/`after`
// hooks onto built-in actions without clobbering pre-existing ones — these
// are the single shared implementation (formerly duplicated per feature).
export { appendBeforeHook, appendAfterHook, toHookArray } from './utils/hooks.js'

// Option-layering merge. Arrays concat by default; ordered-whitelist keys
// (listProperties etc.) replace — pass RESOURCE_OPTIONS_ARRAY_STRATEGIES so
// feature/plugin merges agree with the factory's user-options merge.
export {
  deepMerge,
  RESOURCE_OPTIONS_ARRAY_STRATEGIES,
  type ArrayMergeStrategy,
  type ArrayMergeStrategies,
} from './utils/merge-options.js'
