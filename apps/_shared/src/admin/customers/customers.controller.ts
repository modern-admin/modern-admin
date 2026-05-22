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

import { aiFillFeature } from '@modern-admin/feature-ai-fill'
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
    // AI fill from a business card or contact profile screenshot.
    // Upload a photo → the model extracts name, email, phone, website and bio.
    aiFillFeature({
      prompt:
        'This is a business card or contact profile screenshot. ' +
        'Extract the person\'s contact details as printed on the card.',
      fields: {
        name:       { hint: 'Full name as printed on the card' },
        email:      { hint: 'Email address' },
        phone:      { hint: 'Phone number, include country code if visible' },
        websiteUrl: { hint: 'Website or LinkedIn/social URL if present' },
        bio:        { hint: 'Job title, company name, or short description if present' },
        // Not readable from a photo — skip these fields entirely.
        tier:        { exclude: true },
        score:       { exclude: true },
        avatarUrl:   { exclude: true },
        birthday:    { exclude: true },
        lastLoginAt: { exclude: true },
        createdAt:   { exclude: true },
      },
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
