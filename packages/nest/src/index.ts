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
export { AI_ASSISTANT_QUEUE, AI_ASSISTANT_CHAT_JOB } from './ai-assistant.constants.js'
export type { AiAssistantChatJobData, AiAssistantChatMessageInput, AiAssistantTaskOutput } from './ai-assistant.types.js'
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
export { ModernAdminAuthGuard } from './auth.guard.js'
export { ModernAdminCacheInterceptor } from './cache.interceptor.js'
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

// Standalone static-UI middleware — serves the prebuilt @modern-admin/web SPA
// under a configurable mount path (default `/admin`).
export { ModernAdminStaticUiModule } from './static-ui.module.js'
export {
  ModernAdminStaticUiMiddleware,
  MODERN_ADMIN_STATIC_UI_OPTIONS,
  type ModernAdminStaticUiOptions,
  type ModernAdminUiRuntimeConfig,
} from './static-ui.middleware.js'
