// Posts — showcases:
//   • @Before hook auto-slugifying the title before `new`/`edit`,
//   • record-level @Action `publish` / `unpublish` that mutate the row,
//   • bulk-level @Action `publishMany` operating on selected ids.

import {
  Action,
  AdminController,
  AdminResource,
  Before,
  type AdminActionContext,
  type BulkActionResponse,
  type RecordActionResponse,
} from '@modern-admin/nest'
import { m2mFeature } from '@modern-admin/feature-m2m'
import { adminSource } from '../source-registry.js'
import type { PostRow } from '../types.js'

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60)

@AdminResource({
  source: () => adminSource('posts'),
  navigation: { icon: 'FileText', group: 'Content' },
  relatedResources: [{ resourceId: 'comments', foreignKey: 'postId' }],
  properties: {
    metadata: {
      keyValueFields: [
        { key: 'featured', type: 'boolean', label: 'Featured' },
        {
          key: 'locale',
          type: 'select',
          label: 'Locale',
          availableValues: [
            { value: 'en', label: 'English' },
            { value: 'ru', label: 'Russian' },
            { value: 'de', label: 'German' },
          ],
        },
        {
          key: 'readingMinutes',
          type: 'number',
          label: 'Reading time (min)',
          placeholder: 'e.g. 5',
        },
        {
          key: 'channel',
          type: 'autocomplete',
          label: 'Distribution channel',
          placeholder: 'e.g. newsletter',
          availableValues: ['web', 'newsletter', 'rss', 'twitter', 'telegram'],
        },
        {
          key: 'reviewerEmail',
          type: 'autocomplete',
          label: 'Reviewer email',
          placeholder: 'pick a user or type any email',
          suggestionsResource: 'customers',
          suggestionsField: 'email',
        },
      ],
    },
  },
  features: [
    // Tags relation — uses the table-driven picker dialog
    // (`ReferenceMultiTableDialog`). The dialog embeds the full tags list
    // page with sorting, header filters, column visibility, and pagination,
    // so editors can locate tags the same way they would on the main list.
    // `picker: 'dialog'` is the default for m2m; spelled out here for
    // demonstration. Swap to `'combobox'` for small bounded sets (see
    // `products.controller.ts`).
    m2mFeature({
      property: 'tags',
      through: 'postTags',
      localKey: 'postId',
      foreignKey: 'tagId',
      reference: 'tags',
      extraFields: ['addedAt'],
      picker: 'dialog',
    }),
  ],
})
export class PostsAdminController extends AdminController<PostRow> {
  @Before('new')
  @Before('edit')
  fillSlug(ctx: AdminActionContext<PostRow>): void {
    const t = ctx.payload.title
    if (typeof t === 'string' && (!ctx.payload.slug || ctx.payload.slug.length === 0)) {
      ctx.payload.slug = slugify(t)
    }
  }

  @Action({
    actionType: 'record',
    name: 'publish',
    component: null,
    isVisible: (core) => core.record?.params.published !== true,
    custom: { icon: 'Send', label: 'Publish' },
  })
  async publish(ctx: AdminActionContext<PostRow>): Promise<RecordActionResponse> {
    const record = ctx.record!
    await record.update({ published: true, publishedAt: new Date() })
    return {
      record: record.toJSON(),
      notice: { message: 'Post published', type: 'success' },
    }
  }

  @Action({
    actionType: 'record',
    name: 'unpublish',
    component: null,
    isVisible: (core) => core.record?.params.published === true,
    custom: { icon: 'EyeOff', label: 'Unpublish' },
  })
  async unpublish(ctx: AdminActionContext<PostRow>): Promise<RecordActionResponse> {
    const record = ctx.record!
    await record.update({ published: false })
    return {
      record: record.toJSON(),
      notice: { message: 'Post unpublished', type: 'info' },
    }
  }

  @Action({
    actionType: 'bulk',
    name: 'publishMany',
    component: null,
    custom: { icon: 'Send', label: 'Publish selected' },
  })
  async publishMany(ctx: AdminActionContext<PostRow>): Promise<BulkActionResponse> {
    const records = ctx.records ?? []
    for (const r of records) {
      await r.update({ published: true, publishedAt: new Date() })
    }
    return {
      records: records.map((r) => r.toJSON()),
      notice: {
        message: `${records.length} post${records.length === 1 ? '' : 's'} published`,
        type: 'success',
      },
    }
  }
}
