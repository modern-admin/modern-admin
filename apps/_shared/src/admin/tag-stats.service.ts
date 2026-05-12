// Stateless tag-statistics helper. Counts how many junction rows
// reference a given tag, then writes the total back onto the tag row.
//
// Adapter-agnostic: works against InMemory, Prisma, Drizzle, anything
// implementing `BaseResource.count()` and `BaseResource.findOne()`.
//
// Used by `TagsAdminController` for the "Recount usages" record action
// and "Recount all tags" resource action.

import { Injectable } from '@nestjs/common'
import { Filter, type ModernAdmin } from '@modern-admin/core'

@Injectable()
export class TagStatsService {
  /**
   * Counts junction rows where `tagId === id` across both `postTags`
   * and `productTags`. Returns 0 for either junction when the resource
   * isn't registered (graceful degradation for hosts that ship a
   * subset of demo resources).
   */
  async countUsages(admin: ModernAdmin, tagId: string): Promise<number> {
    const fromPosts = await this.safeCount(admin, 'postTags', tagId)
    const fromProducts = await this.safeCount(admin, 'productTags', tagId)
    return fromPosts + fromProducts
  }

  /**
   * Recompute usageCount from junctions and persist it back on the tag
   * row. Returns the new count so callers can include it in notices.
   */
  async refresh(admin: ModernAdmin, tagId: string): Promise<number> {
    const next = await this.countUsages(admin, tagId)
    try {
      const tag = await admin.findResource('tags').findOne(tagId)
      if (tag) await tag.update({ usageCount: next })
    } catch {
      // Resource missing — nothing to refresh.
    }
    return next
  }

  /**
   * Adapter-portable count: load junction rows via `find()` and match
   * `tagId` exactly in JS. The InMemory adapter does substring matching
   * for string filter values, which over-matches numeric ids ("5" would
   * match "15"), so we cannot push the predicate down. For real ORMs
   * (Prisma) the dataset is bounded (~few hundred junction rows in the
   * demo) and the cost is negligible.
   */
  private async safeCount(admin: ModernAdmin, resourceId: string, tagId: string): Promise<number> {
    try {
      const resource = admin.findResource(resourceId)
      const records = await resource.find(new Filter({}, resource), { limit: 100_000, offset: 0 })
      let count = 0
      for (const record of records) {
        if (String(record.params.tagId) === tagId) count += 1
      }
      return count
    } catch {
      return 0
    }
  }
}
