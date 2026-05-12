// Roles — configurable permission profiles for panel admins.
//
// Backed by `ma_role` (Postgres / Prisma). Each row carries a permission
// matrix (`Record<resourceId, action[]>`, with `'*'` wildcards) consumed
// by `ModernAdmin.invoke()` to gate every panel action.
//
// The role id IS the user-visible name (no separate `name` column) so
// the string stored in `ma_user.role` round-trips through the reference
// renderer in the `admins` resource. Renames aren't supported because
// they would orphan every admin assigned to the role — Prisma treats
// `@id` columns as immutable, so the storage layer enforces this for us.
// To "rename", users clone the role and reassign admins.
//
// Built-in roles (`admin`, `viewer`) are seeded by the host app and
// flagged `isBuiltin: true` — the controller blocks delete on those
// rows so the panel always has a working super-user role.

import {
  AdminController,
  AdminResource,
  Before,
  type AdminActionContext,
} from '@modern-admin/nest'
import { ValidationError } from '@modern-admin/core'
import { adminSource } from '../source-registry.js'
import type { RoleRow } from '../types.js'

@AdminResource({
  source: () => adminSource('roles'),
  navigation: { icon: 'KeyRound', group: 'Access Control' },
  properties: {
    // Stored as JSON; the panel renders a permissions-matrix editor on
    // top of this. Until Phase 5 ships the bespoke renderer the default
    // JSON editor is good enough to seed and tweak roles by hand.
    permissions: { type: 'json' },
    // `isBuiltin` is set on seed and never editable through the panel —
    // hide it from create/edit forms; surface it in list/show as a badge.
    isBuiltin: { type: 'boolean', isVisible: { list: true, show: true, edit: false, filter: true } },
    createdAt: { type: 'datetime' },
    updatedAt: { type: 'datetime' },
  },
})
export class RolesAdminController extends AdminController<RoleRow> {
  @Before('delete')
  @Before('bulkDelete')
  guardBuiltinDelete(ctx: AdminActionContext<RoleRow>): void {
    const records = ctx.records ?? (ctx.record ? [ctx.record] : [])
    for (const record of records) {
      const params = record.params as unknown as RoleRow
      if (params.isBuiltin) {
        throw new ValidationError(
          {},
          { message: `Built-in role "${params.id}" cannot be deleted.` },
        )
      }
    }
  }
}
