// Side-effect module that wires every shared admin controller to the
// Prisma adapter for this host app. Imported once at the top of
// `admin.module.ts` so that registrations land before NestJS bootstrap
// (which is when ResourcesFactory dereferences the source thunks
// declared by `@AdminResource({ source: () => adminSource(id) })`).
//
// Schema-name vs logical-id mapping
// ----------------------------------
// Shared controllers reference resources by lowercase logical ids
// (`customers`, `posts`, …). The Prisma schema uses domain-specific
// model names (`Customer`, `Post`, …). PrismaResource derives its id
// from `model.name`, so each factory clones the DMMF model with
// `{ ...model, name: logicalId }` and supplies an explicit `clientKey`
// pointing at the original Prisma delegate (`customer`, …).
//
// Relation fields also carry the original model name in `field.type`
// (e.g. `author: Customer`). The adapter's foreign-key→reference map
// reads that value, so we must rewrite it to the logical id too —
// otherwise FK columns end up pointing at "Customer" while the resource
// is registered as "customers" and `findResource()` fails (label
// resolution on dashboard charts being the most visible symptom).
//
// `Prisma.dmmf` is generated alongside the client and contains the
// metadata for every model declared in `prisma/schema.prisma`.

import { registerAdminSources } from '@modern-admin/app-shared'
import type { DmmfModel, PrismaResourceConfig } from '@modern-admin/adapter-prisma'
import { dmmf, prisma } from './db.js'

const lowerFirst = (s: string): string =>
  s.length === 0 ? s : s.charAt(0).toLowerCase() + s.slice(1)

/** Prisma model name → logical resource id. Populated below from the
 *  same map passed to `registerAdminSources` so the two stay in sync. */
const MODEL_TO_LOGICAL: Record<string, string> = {
  MaUser: 'admins',
  MaRole: 'roles',
  Customer: 'customers',
  Category: 'categories',
  Tag: 'tags',
  Post: 'posts',
  PostTag: 'postTags',
  Comment: 'comments',
  Product: 'products',
  ProductTag: 'productTags',
  RegionalContent: 'regionalContent',
  Favorite: 'favorites',
}

/**
 * Build a `PrismaResourceConfig` for a Prisma model, exposing it under
 * the given logical resource id. The original model delegate is kept
 * reachable via `clientKey` (e.g. `customer`). Relation fields whose
 * target model is in `MODEL_TO_LOGICAL` get their `type` remapped so
 * the FK→reference map produced by the adapter uses the same logical
 * ids that `findResource` understands.
 */
const buildPrismaSource = (
  modelName: string,
  logicalId: string,
): (() => PrismaResourceConfig) => () => {
  const model = dmmf.datamodel.models.find((m) => m.name === modelName) as
    | DmmfModel
    | undefined
  if (!model) {
    throw new Error(
      `[admin] Prisma model "${modelName}" not found in DMMF — ` +
      `did you forget to re-run \`bun run prisma:generate\` after editing schema.prisma?`,
    )
  }
  const fields = model.fields.map((f) => {
    if (f.kind !== 'object') return f
    const mapped = MODEL_TO_LOGICAL[f.type]
    return mapped ? { ...f, type: mapped } : f
  })
  return {
    model: { ...model, name: logicalId, fields },
    client: prisma as never,
    clientKey: lowerFirst(modelName),
    enums: dmmf.datamodel.enums as never,
  }
}

registerAdminSources({
  // Better Auth's `ma_user` is exposed as the panel `admins` resource —
  // these are the people who log into the panel itself.
  admins: buildPrismaSource('MaUser', 'admins'),
  // Configurable permission profiles, referenced by `MaUser.role`.
  roles: buildPrismaSource('MaRole', 'roles'),
  customers: buildPrismaSource('Customer', 'customers'),
  categories: buildPrismaSource('Category', 'categories'),
  tags: buildPrismaSource('Tag', 'tags'),
  posts: buildPrismaSource('Post', 'posts'),
  postTags: buildPrismaSource('PostTag', 'postTags'),
  comments: buildPrismaSource('Comment', 'comments'),
  products: buildPrismaSource('Product', 'products'),
  productTags: buildPrismaSource('ProductTag', 'productTags'),
  regionalContent: buildPrismaSource('RegionalContent', 'regionalContent'),
  favorites: buildPrismaSource('Favorite', 'favorites'),
})
