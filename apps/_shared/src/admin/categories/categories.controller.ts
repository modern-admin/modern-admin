// Categories — showcases overriding a built-in handler. We intercept
// `show` to enrich the response with a computed `postCount` that the
// underlying resource doesn't actually persist.
//
// Cross-resource access goes through `this.admin.findResource('posts')`
// instead of reaching into adapter internals — same controller works
// against InMemory and Prisma.

import {
  AdminController,
  AdminResource,
  type RecordActionResponse,
  type ShowContext,
} from '@modern-admin/nest'
import { Filter } from '@modern-admin/core'
import { adminSource } from '../source-registry.js'
import type { CategoryRow } from '../types.js'

@AdminResource({
  source: () => adminSource('categories'),
  navigation: { icon: 'FolderTree', group: 'Content' },
  relatedResources: [{ resourceId: 'posts', foreignKey: 'categoryId' }],
})
export class CategoriesAdminController extends AdminController<CategoryRow> {
  override async show(ctx: ShowContext<CategoryRow>): Promise<RecordActionResponse> {
    const base = await super.show(ctx)
    const id = ctx.record.id()
    let postCount = 0
    try {
      const posts = this.admin.findResource('posts')
      postCount = await posts.count(new Filter({ categoryId: id }, posts))
    } catch {
      // posts resource may not be registered in this host; treat as 0.
    }
    return {
      ...base,
      record: base.record!,
      meta: { ...(base.meta ?? {}), postCount },
    }
  }
}
