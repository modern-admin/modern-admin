// ProductTags — junction resource backing the `products <-> tags` m2m
// relation. Carries an extra `position` column for explicit ordering.
// Hidden from sidebar navigation; see `posts/post-tags.controller.ts`
// for the rationale.

import { AdminController, AdminResource } from '@modern-admin/nest'
import { adminSource } from '../source-registry.js'
import type { ProductTagRow } from '../types.js'

@AdminResource({
  source: () => adminSource('productTags'),
  navigation: null,
})
export class ProductTagsAdminController extends AdminController<ProductTagRow> {}
