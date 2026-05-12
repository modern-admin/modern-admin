// Tags — showcases NestJS DI inside an admin controller. `TagStatsService`
// is provided by the feature module; the scanner constructs the controller
// through DI like a normal Nest provider.
//
// Two custom @Action handlers expose:
//   • `recount` (record-level) — refresh `usageCount` on a single tag,
//   • `recountAll` (resource-level) — sweep every tag in the table.
//
// Cross-resource access (junction tables for usage counts) routes through
// `this.admin.findResource('postTags' | 'productTags')` — see
// `../tag-stats.service.ts` for the adapter-portable implementation.

import {
  Action,
  AdminController,
  AdminResource,
  type AdminActionContext,
  type ActionResponse,
  type RecordActionResponse,
} from '@modern-admin/nest'
import { Filter } from '@modern-admin/core'
import { adminSource } from '../source-registry.js'
import { TagStatsService } from '../tag-stats.service.js'
import type { TagRow } from '../types.js'

@AdminResource({
  source: () => adminSource('tags'),
  navigation: { icon: 'Tag', group: 'Content' },
  // Posts and products both reference tags through real junction tables
  // (`postTags`, `productTags`) wired by `m2mFeature`. The reverse listing
  // is therefore not declared here — `relatedResources` only works for
  // direct FK columns, while m2m is junction-mediated.
})
export class TagsAdminController extends AdminController<TagRow> {
  constructor(private readonly stats: TagStatsService) {
    super()
  }

  @Action({
    actionType: 'record',
    name: 'recount',
    component: null,
    custom: { icon: 'RefreshCw', label: 'Recount usages' },
  })
  async recount(ctx: AdminActionContext<TagRow>): Promise<RecordActionResponse> {
    const record = ctx.record!
    const next = await this.stats.refresh(this.admin, record.id())
    return {
      record: record.toJSON(),
      notice: { message: `Recounted: ${next} usages`, type: 'success' },
    }
  }

  @Action({
    actionType: 'resource',
    name: 'recountAll',
    component: null,
    custom: { icon: 'RefreshCw', label: 'Recount all tags' },
  })
  async recountAll(): Promise<ActionResponse> {
    const tags = this.admin.findResource('tags')
    const records = await tags.find(new Filter({}, tags), { limit: 100_000, offset: 0 })
    let updated = 0
    for (const record of records) {
      await this.stats.refresh(this.admin, record.id())
      updated += 1
    }
    return {
      notice: { message: `Recounted ${updated} tag${updated === 1 ? '' : 's'}`, type: 'success' },
    }
  }
}
