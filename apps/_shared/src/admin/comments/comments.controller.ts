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
