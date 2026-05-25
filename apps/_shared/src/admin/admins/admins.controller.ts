// Admins — panel administrators backed by Better Auth's `ma_user` table.
//
// Distinct from `customers` (the application end-users): admins are the
// people who log into the panel itself. The `role` column references a
// row in `ma_role` (id == name) and drives the permissions matrix
// enforced by `ModernAdmin.invoke()`.
//
// Source is resolved at runtime via `adminSource('admins')`. In
// `apps/api-prisma` it points at the `MaUser` Prisma model (the same
// table Better Auth writes session/account rows against), so the
// `admins` resource and the auth layer share a single source of truth.
//
// Credentials are intentionally NOT managed through this resource:
// Better Auth keeps password hashes in `ma_account`, not on the user
// row, and password resets go through `auth.api.setUserPassword` on
// the admin plugin endpoint — the panel will invoke that directly via
// a custom record action in a follow-up phase.

import {
  AdminController,
  AdminResource,
  Before,
  type AdminActionContext,
} from '@modern-admin/nest'
import { adminSource } from '../source-registry.js'
import type { AdminUserRow } from '../types.js'

@AdminResource({
  source: () => adminSource('admins'),
  navigation: { icon: 'Shield', group: 'Access Control' },
  titleProperty: 'email',
  properties: {
    // `role` is stored as a plain string in `ma_user` (Better Auth's
    // admin plugin contract). We override the property metadata to point
    // at the `roles` resource so the UI renders a dropdown of existing
    // roles. The role's `id` doubles as the user-visible name, so the
    // string round-trips cleanly through the reference renderer.
    role: { type: 'reference', reference: 'roles' },
    // Better Auth stores the avatar in `image`; surface it as a media
    // preview in the list/show views.
    image: { type: 'previewMedia' },
    banned: { type: 'boolean' },
    banReason: { type: 'string' },
    banExpires: { type: 'datetime' },
    createdAt: { type: 'datetime' },
    updatedAt: { type: 'datetime' },
  },
})
export class AdminsAdminController extends AdminController<AdminUserRow> {
  /** Lower-case the email and trim the display name on every create/update. */
  @Before('new')
  @Before('edit')
  normalize(ctx: AdminActionContext<AdminUserRow>): void {
    if (typeof ctx.payload.email === 'string') {
      ctx.payload.email = ctx.payload.email.trim().toLowerCase()
    }
    if (typeof ctx.payload.name === 'string') {
      ctx.payload.name = ctx.payload.name.trim()
    }
  }
}
