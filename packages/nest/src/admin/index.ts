// @modern-admin/nest — class-based resource controller surface.

export { ModernAdminBootstrapService } from './bootstrap.service.js'
export { AdminController, type AdminControllerClass } from './admin-controller.js'
export {
  AdminResource,
  Action,
  Before,
  After,
  type ActionMeta,
  type ActionDecoratorOptions,
  type AdminResourceMeta,
  type HookKind,
  type HookMeta,
} from './decorators.js'
export {
  AdminControllerScanner,
  type ScannedController,
} from './scanner.js'
export {
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
} from './admin-context.js'
