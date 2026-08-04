// Comments — showcases @After hooks calling out to a Nest-provided
// service. `AuditLogService` records every successful destructive action
// so admins can inspect who deleted what (in the demo it just logs to
// stdout).

import {
  AdminController,
  AdminResource,
  After,
  type AdminActionContext,
} from '@modern-admin/nest'
import { adminSource } from '../source-registry.js'
import { AuditLogService } from '../audit-log.service.js'
import type { CommentRow } from '../types.js'

@AdminResource({
  source: () => adminSource('comments'),
  navigation: { icon: 'MessageSquare', group: 'Content' },
  // Filters are their own view, independent of the table columns:
  // `filterProperties` whitelists *and* orders what the Filters sheet offers.
  // `body` is deliberately absent — free-text over comment bodies is what
  // global search is for — while `id` is opted back in even though the default
  // filter view drops id columns: looking a comment up by an id pasted out of a
  // support ticket is routine.
  filterProperties: ['id', 'postId', 'authorId', 'rating'],
})
export class CommentsAdminController extends AdminController<CommentRow> {
  constructor(private readonly audit: AuditLogService) {
    super()
  }

  @After('delete')
  logDelete(ctx: AdminActionContext<CommentRow>): void {
    const id = ctx.record?.id() ?? ctx.params.recordId
    if (!id) return
    this.audit.record({
      actor: ctx.currentAdmin?.email ?? 'anonymous',
      resourceId: 'comments',
      action: 'delete',
      recordId: id,
    })
  }

  @After('bulkDelete')
  logBulkDelete(ctx: AdminActionContext<CommentRow>): void {
    const ids = ctx.records?.map((r) => r.id()) ?? []
    this.audit.record({
      actor: ctx.currentAdmin?.email ?? 'anonymous',
      resourceId: 'comments',
      action: 'bulkDelete',
      recordIds: ids,
    })
  }
}
