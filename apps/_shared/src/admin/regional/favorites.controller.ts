// Favorites — showcases property-level `showWhen` without the JSON
// fan-out. A single `kind` enum picks which reference field the form
// displays: `postId`, `productId`, or `categoryId`. The other two are
// hidden and skipped by validation, so required-ness on the visible
// field works as expected.

import { AdminController, AdminResource } from '@modern-admin/nest'
import { adminSource } from '../source-registry.js'
import type { FavoriteRow } from '../types.js'

@AdminResource({
  source: () => adminSource('favorites'),
  navigation: { icon: 'Star', group: 'Content' },
  listProperties: ['id', 'label', 'kind', 'createdAt'],
  properties: {
    postId: {
      isRequired: true,
      showWhen: { field: 'kind', equals: 'post', defaultWhenEmpty: true },
    },
    productId: {
      isRequired: true,
      showWhen: { field: 'kind', equals: 'product' },
    },
    categoryId: {
      isRequired: true,
      showWhen: { field: 'kind', equals: 'category' },
    },
  },
})
export class FavoritesAdminController extends AdminController<FavoriteRow> {}
