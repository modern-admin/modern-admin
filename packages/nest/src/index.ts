// @modern-admin/nest — NestJS module wrapping @modern-admin/core.

export { ModernAdminModule, type ModernAdminModuleOptions } from './module.js'
export { ResourceController } from './resource.controller.js'
export { ConfigController } from './config.controller.js'
export { ModernAdminAuthGuard } from './auth.guard.js'
export { ModernAdminCacheInterceptor } from './cache.interceptor.js'
export { MODERN_ADMIN, MODERN_ADMIN_OPTIONS } from './tokens.js'
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
