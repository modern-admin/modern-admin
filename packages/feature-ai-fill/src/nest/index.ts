// @modern-admin/feature-ai-fill/nest — NestJS integration.
//
// Re-exports the module + tokens consumed by host applications.

export {
  ModernAdminAiFillModule,
  type ModernAdminAiFillModuleOptions,
} from './ai-fill.module.js'
export { AI_FILL_MODULE_OPTIONS } from './ai-fill.tokens.js'
export { AiFillService } from './ai-fill.service.js'
export { AiFillController, AiFillThrottlerGuard } from './ai-fill.controller.js'
