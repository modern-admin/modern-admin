// Side-effect module that wires every shared admin controller to the
// in-memory adapter for this host app. Imported once at the top of
// `admin.module.ts` so that registrations land before NestJS bootstrap
// (which is when ResourcesFactory dereferences the source thunks
// declared by `@AdminResource({ source: () => adminSource(id) })`).

import { registerAdminSources } from '@modern-admin/app-shared'
import { seed } from './demo/seed.js'

const db = seed()

const findTable = (name: string) => {
  const table = db.tables.find((t) => t.name === name)
  if (!table) throw new Error(`[admin] in-memory table "${name}" missing from seed`)
  return table
}

registerAdminSources({
  // Standalone in-memory tables for the Access Control demo. In
  // `apps/api-prisma` the same logical ids map onto Better Auth's
  // `ma_user` and the new `ma_role` tables.
  admins: () => findTable('admins'),
  roles: () => findTable('roles'),
  customers: () => findTable('customers'),
  posts: () => findTable('posts'),
  postTags: () => findTable('postTags'),
  categories: () => findTable('categories'),
  tags: () => findTable('tags'),
  comments: () => findTable('comments'),
  products: () => findTable('products'),
  productTags: () => findTable('productTags'),
  regionalContent: () => findTable('regionalContent'),
  favorites: () => findTable('favorites'),
})

/** Re-export so existing call sites that need direct table access keep working. */
export { db, findTable }
