// Barrel for the shared admin layer (controllers + supporting bits).
// Used by both `apps/api` (InMemory) and `apps/api-prisma` (Prisma) —
// each host registers its raw sources via `registerAdminSource(...)`
// before NestJS bootstrap, then imports the per-resource feature modules.

export {
  registerAdminSource,
  registerAdminSources,
  adminSource,
  hasAdminSource,
  clearAdminSources,
  type AdminSourceFactory,
} from './source-registry.js'

export type {
  CustomerRow,
  AdminUserRow,
  RoleRow,
  RolePermissions,
  PostRow,
  CategoryRow,
  TagRow,
  CommentRow,
  RegionalContentRow,
  FavoriteRow,
  ProductRow,
  PostTagRow,
  ProductTagRow,
} from './types.js'

export { AuditLogService, type AuditEntry } from './audit-log.service.js'
export { TagStatsService } from './tag-stats.service.js'

export { CustomersAdminController } from './customers/customers.controller.js'
export { CustomersAdminModule } from './customers/customers.module.js'

export { AdminsAdminController } from './admins/admins.controller.js'
export { AdminsAdminModule } from './admins/admins.module.js'

export { RolesAdminController } from './roles/roles.controller.js'
export { RolesAdminModule } from './roles/roles.module.js'

export { CategoriesAdminController } from './categories/categories.controller.js'
export { CategoriesAdminModule } from './categories/categories.module.js'

export { TagsAdminController } from './tags/tags.controller.js'
export { TagsAdminModule } from './tags/tags.module.js'

export { PostsAdminController } from './posts/posts.controller.js'
export { PostTagsAdminController } from './posts/post-tags.controller.js'
export { PostsAdminModule } from './posts/posts.module.js'

export { CommentsAdminController } from './comments/comments.controller.js'
export { CommentsAdminModule } from './comments/comments.module.js'

export { ProductsAdminController } from './products/products.controller.js'
export { ProductTagsAdminController } from './products/product-tags.controller.js'
export { ProductsAdminModule } from './products/products.module.js'

export { RegionalContentAdminController } from './regional/regional-content.controller.js'
export { FavoritesAdminController } from './regional/favorites.controller.js'
export { RegionalAdminModule } from './regional/regional.module.js'
