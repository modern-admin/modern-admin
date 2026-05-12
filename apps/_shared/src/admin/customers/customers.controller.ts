// Customers — application end-users (NOT admins). Showcases:
//   • feature plugin (passwordsFeature) for encrypting credentials,
//   • @Before hooks normalising payload before built-in `new`/`edit`,
//   • a custom record-level @Action that mutates the row through
//     `ctx.record.update(...)` and returns a notice.
//
// Source is resolved at runtime via `adminSource('customers')` so the same
// controller works against both the InMemory adapter (apps/api) and
// Prisma (apps/api-prisma).
//
// Renamed from "users" to "customers" — admins (the people who log into
// the panel) live in the Better Auth `ma_user` table and are exposed via
// the separate `admins` resource. `tier` replaces the old `role` field
// since plan/subscription is the relevant axis for app users, not
// panel-access roles.

import { passwordsFeature } from '@modern-admin/feature-password'
import {
  Action,
  AdminController,
  AdminResource,
  Before,
  type AdminActionContext,
  type RecordActionResponse,
} from '@modern-admin/nest'
import { adminSource } from '../source-registry.js'
import type { CustomerRow } from '../types.js'

@AdminResource({
  source: () => adminSource('customers'),
  navigation: { icon: 'Users', group: 'Customers' },
  relatedResources: [
    { resourceId: 'posts', foreignKey: 'authorId' },
    { resourceId: 'comments', foreignKey: 'authorId' },
  ],
  features: [
    passwordsFeature({
      properties: {
        encryptedPassword: 'password',
        password: 'newPassword',
      },
      // Bun ships argon2id natively — no extra dependency required.
      hash: (plain) => Bun.password.hash(plain, 'argon2id'),
    }),
  ],
})
export class CustomersAdminController extends AdminController<CustomerRow> {
  /** Lower-case the email and trim the display name on every create/update. */
  @Before('new')
  @Before('edit')
  normalize(ctx: AdminActionContext<CustomerRow>): void {
    if (typeof ctx.payload.email === 'string') {
      ctx.payload.email = ctx.payload.email.trim().toLowerCase()
    }
    if (typeof ctx.payload.name === 'string') {
      ctx.payload.name = ctx.payload.name.trim()
    }
  }

  /** Force the customer to set a new password on next login. */
  @Action({
    actionType: 'record',
    name: 'resetPassword',
    component: null,
    custom: { icon: 'KeyRound', label: 'Reset password' },
  })
  async resetPassword(ctx: AdminActionContext<CustomerRow>): Promise<RecordActionResponse> {
    const record = ctx.record!
    await record.update({ password: '' })
    return {
      record: record.toJSON(),
      notice: { message: `Password cleared for ${record.params.email as string}`, type: 'success' },
    }
  }
}
