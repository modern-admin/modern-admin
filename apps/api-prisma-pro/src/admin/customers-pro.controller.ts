// Pro overlay for the shared `customers` resource.
//
// `@modern-admin/app-shared` exports the canonical `CustomersAdminController`
// (open-core) which is wired into both `apps/api` and `apps/api-prisma` in
// the open-core monorepo. The Pro demo swaps that controller for this one
// so the `customers` resource opts in to `aiFillFeature(...)` from
// `@modern-admin-pro/feature-ai-fill`.
//
// Mechanics:
//   * The open-core `CustomersAdminModule` is NOT imported in this app's
//     `admin.module.ts` — `CustomersProAdminModule` (below) takes its place
//     and registers a single controller with the same `'customers'` route.
//   * `passwordsFeature` + the `@Before` normalisers + `resetPassword`
//     action mirror the open-core controller verbatim so existing e2e
//     fixtures keep passing.

import { aiFillFeature } from '@modern-admin-pro/feature-ai-fill'
import { passwordsFeature } from '@modern-admin/feature-password'
import {
  Action,
  AdminController,
  AdminResource,
  Before,
  type AdminActionContext,
  type RecordActionResponse,
} from '@modern-admin/nest'
import { adminSource, type CustomerRow } from '@modern-admin/app-shared'

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
      hash: (plain: string) => Bun.password.hash(plain, 'argon2id'),
    }),
    // AI fill from a business card or contact profile screenshot.
    // Upload a photo → the model extracts name, email, phone, website and bio.
    aiFillFeature({
      prompt:
        'This is a business card or contact profile screenshot. ' +
        "Extract the person's contact details as printed on the card.",
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
export class CustomersProAdminController extends AdminController<CustomerRow> {
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
