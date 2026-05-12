// Row shapes for the demo resources. These are hand-rolled because the
// shared admin layer must run on either the InMemory adapter (apps/api)
// or the Prisma adapter (apps/api-prisma) — there's no single ORM
// generator we can pull types from.
//
// In a real single-ORM project you'd drop this file and import row
// types straight from your ORM:
//
//   • Prisma  — `import type { User } from '@prisma/client'`
//   • Drizzle — `type User = typeof users.$inferSelect`
//   • TypeORM — entity class as the type
//   • Mongoose — `InferSchemaType<typeof userSchema>`
//
// Stays in lockstep with `apps/api/src/demo/seed.ts` and the Prisma
// schema additions in `apps/api-prisma/prisma/schema.prisma`.

import type { M2MItem } from '@modern-admin/feature-m2m'

/** Demo "people who use the app" resource. Independent of admins —
 *  customers don't log into the panel; admins manage them. */
export interface CustomerRow {
  id: string
  email: string
  name: string
  phone?: string
  /** Subscription/account plan. Replaces the previous `role` field which
   *  was confusingly named since these are application customers, not
   *  panel admins. */
  tier: 'free' | 'pro' | 'enterprise'
  password?: string
  /** Filled by `passwordsFeature` on create/edit. */
  newPassword?: string
  avatarUrl?: string
  websiteUrl?: string
  bio?: string
  score?: number
  birthday?: Date
  lastLoginAt?: Date
  createdAt?: Date
}

/** Permission grant shape: per-resource list of allowed action names.
 *  `'*'` as a key matches every resource; `'*'` in the action list grants
 *  every action on that resource. Mirrors the api-key permission model. */
export type RolePermissions = Record<string, string[]>

/** Row shape for the `roles` resource — backed by `ma_role`. The `id`
 *  doubles as the user-visible role name (there is no separate `name`
 *  column) so the string in `ma_user.role` round-trips cleanly through
 *  the reference renderer. Built-in roles (`admin`, `viewer`) are seeded
 *  by `apps/api-prisma/src/seed-demo.ts` and marked `isBuiltin`. */
export interface RoleRow {
  id: string
  description?: string
  permissions: RolePermissions
  isBuiltin?: boolean
  createdAt?: Date
  updatedAt?: Date
}

/** Row shape for the `admins` resource — backed by Better Auth's `ma_user`
 *  table. The `role` column is added by Better Auth's admin plugin and
 *  references `ma_role.id` (which doubles as the role's user-visible name). */
export interface AdminUserRow {
  id: string
  email: string
  name: string
  /** Role id; resolves to a row in `ma_role` for permissions lookup.
   *  Defaults to `'admin'` for new admins to preserve full access. */
  role?: string
  /** Profile image; Better Auth stores it as `image` (no `avatarUrl`
   *  normalisation — keep the column name aligned with the upstream
   *  schema so adapters don't have to translate). */
  image?: string
  banned?: boolean
  banReason?: string
  banExpires?: Date
  emailVerified?: boolean
  createdAt?: Date
  updatedAt?: Date
}

export interface PostRow {
  id: string
  title: string
  slug?: string
  excerpt?: string
  body?: string
  authorId: string
  categoryId?: string
  /** Virtual m2m hydrated from the `postTags` junction. */
  tags?: M2MItem[]
  coverUrl?: string
  viewsCount?: number
  rating?: number
  metadata?: unknown
  published?: boolean
  publishedAt?: Date
}

export interface CategoryRow {
  id: string
  name: string
  slug?: string
  description?: string
  position?: number
  iconUrl?: string
}

export interface TagRow {
  id: string
  name: string
  slug?: string
  color?: string
  usageCount?: number
}

export interface CommentRow {
  id: string
  postId: string
  authorId: string
  body: string
  rating?: number
  createdAt?: Date
}

export interface RegionalContentRow {
  id: string
  name: string
  region: 'eu' | 'us' | 'asia'
  titles?: Record<string, string>
  previews?: Record<string, string>
  publishedAt?: Date
}

export interface FavoriteRow {
  id: string
  label: string
  kind: 'post' | 'product' | 'category'
  postId?: string | null
  productId?: string | null
  categoryId?: string | null
  createdAt?: Date
}

export interface ProductRow {
  id: string
  sku?: string
  name: string
  slug?: string
  summary?: string
  description?: string
  price?: number
  currencyCode?: string
  accentColor?: string
  inStock?: boolean
  quantity?: number
  rating?: number
  launchedAt?: Date
  thumbnail?: string
  gallery?: string[]
  categoryId?: string
  /** Virtual m2m hydrated from the `productTags` junction. */
  tags?: M2MItem[]
}

export interface PostTagRow {
  id: string
  postId: string
  tagId: string
  addedAt?: Date
}

export interface ProductTagRow {
  id: string
  productId: string
  tagId: string
  position?: number
}
