// @modern-admin/nest — NestJS module wrapping @modern-admin/core.

export { ModernAdminModule, ModernAdminFeatureModule, type ModernAdminModuleOptions } from './module.js'
export { ResourceController } from './resource.controller.js'
export { ConfigController } from './config.controller.js'
export { AuthController } from './auth.controller.js'
export { ApiKeysController, type IApiKeyService, type ApiKeyResponse } from './api-keys.controller.js'
export { AiAssistantController } from './ai-assistant.controller.js'
export {
  AiAssistantService,
  AI_ASSISTANT_SETTINGS_KEY,
  type AiAssistantPublicSettings,
  type AiAssistantStoredSettings,
} from './ai-assistant.service.js'
export { AiAssistantProcessor } from './ai-assistant.processor.js'
export { MediaGenerationController, MediaGenerationWebhookController } from './media-generation.controller.js'
export {
  MediaGenerationService,
  MEDIA_GENERATION_SETTINGS_KEY,
  MEDIA_GENERATION_TASK_KIND,
} from './media-generation.service.js'
export type {
  MediaGenerationOptions,
  MediaGenerationPublicSettings,
  MediaGenerationStoredSettings,
  MediaGenerationTask,
  MediaGenerationTaskOutput,
} from './media-generation.types.js'
export { AI_ASSISTANT_QUEUE, AI_ASSISTANT_CHAT_JOB } from './ai-assistant.constants.js'
export {
  ApiStockLlmProvider,
  OpenRouterLlmProvider,
  type ILlmProvider,
  type LlmChatMessage,
  type LlmGenerateInput,
  type LlmGenerateResult,
  type LlmTool,
} from './llm-provider.js'
export type {
  AiAssistantChatJobData,
  AiAssistantChatMessageInput,
  AiAssistantQueueOptions,
  AiAssistantTaskOutput,
  IAiAssistantQueueDispatcher,
} from './ai-assistant.types.js'
export {
  AnalyticsController,
  type TimeSeriesRequest,
  type TimeSeriesResponse,
} from './analytics.controller.js'
export {
  HistoryController,
  type HistoryListResponse,
  type HistoryRevisionResponse,
} from './history.controller.js'
export { AuditLogController, type AuditLogResponse } from './audit-log.controller.js'
export { CacheController, type CacheStatsResponse } from './cache.controller.js'
export {
  GlobalSearchController,
  type GlobalSearchGroup,
  type GlobalSearchHit,
  type GlobalSearchResponse,
} from './global-search.controller.js'
export {
  WebhooksController,
  type WebhookDeliveriesResponse,
  type WebhookResponse,
  type WebhooksListResponse,
} from './webhooks.controller.js'
export { ModernAdminAuthGuard, ModernAdminConfigGuard } from './auth.guard.js'
export { ModernAdminCacheInterceptor } from './cache.interceptor.js'
export { NoHttpCache, NO_HTTP_CACHE } from './no-http-cache.js'
export { MODERN_ADMIN, MODERN_ADMIN_OPTIONS, MODERN_ADMIN_API_KEY_SERVICE } from './tokens.js'
export {
  setupOpenApi,
  type SetupOpenApiOptions,
  type OpenApiBearerOption,
  type OpenApiCookieOption,
  type OpenApiTagDef,
  type ScalarOptions,
} from './openapi.js'
export {
  bulkBodyZ,
  createBodyZ,
  listQueryZ,
  recordIdParamZ,
  resourceParamZ,
  updateBodyZ,
  type BulkBody,
  type ListQuery,
  type RecordIdParam,
  type ResourceParam,
} from './dto.js'

// Class-based admin controller API.
export {
  AdminController,
  AdminResource,
  Action,
  Before,
  After,
  AdminControllerScanner,
  ModernAdminBootstrapService,
  type AdminControllerClass,
  type ActionMeta,
  type ActionDecoratorOptions,
  type AdminResourceMeta,
  type HookKind,
  type HookMeta,
  type ScannedController,
  type AdminActionContext,
  type ListContext,
  type ShowContext,
  type NewContext,
  type EditContext,
  type DeleteContext,
  type BulkDeleteContext,
  type SearchContext,
  type ActionResponse,
  type ListActionResponse,
  type RecordActionResponse,
  type BulkActionResponse,
} from './admin'

// Better Auth middleware — use instead of bare toNodeHandler() so that
// @modern-admin/nest's AuthController endpoints (/me, /login, /ui-props)
// are not shadowed by Better Auth's greedy handler.
export { createBetterAuthMiddleware } from './better-auth-middleware.js'

// Standalone static-UI middleware — serves the prebuilt @modern-admin/web SPA
// under a configurable mount path (default `/admin`).
export {
  ModernAdminStaticUiModule,
  type ModernAdminStaticUiAsyncOptions,
} from './static-ui.module.js'
export {
  ModernAdminStaticUiMiddleware,
  MODERN_ADMIN_STATIC_UI_OPTIONS,
  type AdminHttpRequest,
  type ModernAdminHeadHtmlFactory,
  type ModernAdminRuntimeConfigFactory,
  type ModernAdminStaticUiOptions,
  type ModernAdminUiRuntimeConfig,
} from './static-ui.middleware.js'
