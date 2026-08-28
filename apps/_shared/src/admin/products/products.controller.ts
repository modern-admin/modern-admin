// Products — showcases:
//   • the upload feature plugin (file/gallery uploads through busboy),
//   • overriding the built-in `list` to inject a computed `inStockCount`
//     into the response meta (visible from the React app's list view),
//   • record-level @Action handlers archive/restock/duplicateSku,
//   • a resource-level @Action `markFeaturedPalette` that mutates the
//     first six products through the shared adapter API,
//   • a resource-level @Action `bulkRepriceUi` that renders its own UI
//     (`component: 'bulk-reprice'`) instead of firing on click.
//
// Adapter-portable: cross-resource access is done via `this.resource`
// or `this.admin.findResource(...)` rather than reaching into adapter
// internals.

import { extname } from 'node:path'
import { Filter, uuidv7 } from '@modern-admin/core'
import { uploadFeature, LocalUploadProvider } from '@modern-admin/feature-upload'
import { mediaGenerationFeature } from '@modern-admin/feature-media-generation'
import { m2mFeature } from '@modern-admin/feature-m2m'
import {
  Action,
  AdminController,
  AdminResource,
  type AdminActionContext,
  type ActionResponse,
  type ListActionResponse,
  type ListContext,
  type RecordActionResponse,
} from '@modern-admin/nest'
import { adminSource } from '../source-registry.js'
import type { ProductRow } from '../types.js'

const productProvider = new LocalUploadProvider({
  uploadDir: './uploads',
  baseUrl: `http://localhost:${process.env.API_PORT ?? 3001}/uploads`,
})

const productKeyer = (subdir: string) => (filename: string): string => {
  const ext = extname(filename)
  return `products/${subdir}/${uuidv7()}${ext}`
}

@AdminResource({
  source: () => adminSource('products'),
  navigation: { icon: 'Package', group: 'Catalog' },
  listProperties: ['id', 'thumbnail', 'name', 'price', 'currencyCode', 'inStock'],
  properties: {
    sku: {
      description: 'UUID demo with copy-to-clipboard action on the show page.',
      custom: { copiable: true },
    },
    accentColor: {
      description: 'Accent color edited with the custom color picker.',
      components: { edit: 'color-picker', show: 'color-swatch' },
    },
    price: {
      description: 'Money input demo with decimal formatting.',
    },
  },
  features: [
    uploadFeature({
      properties: {
        thumbnail: {
          provider: productProvider,
          mimeTypes: ['image/*'],
          maxSize: 10 * 1024 * 1024,
          uploadPath: productKeyer('thumbnails'),
        },
        gallery: {
          provider: productProvider,
          isArray: true,
          mimeTypes: ['image/*'],
          maxSize: 10 * 1024 * 1024,
          uploadPath: productKeyer('gallery'),
        },
      },
    }),
    mediaGenerationFeature({
      targetProperty: 'thumbnail',
      sourceProperties: ['name', 'description', 'category', 'price', 'currencyCode'],
      promptTemplate:
        'Create a polished ecommerce product card for {name}. ' +
        'Product description: {description}. Category: {category}. ' +
        'Show the product clearly on a clean commercial background. ' +
        'Do not add a price or text to the image.',
      mediaTypes: ['image'],
      nesting: 'Merchandising',
    }),
    // Contrast with posts.tags: same m2m mechanics, but rendered as a
    // compact inline combobox instead of the table-driven dialog. Useful
    // when the reference table is small enough to fit in a dropdown and
    // you'd rather not steal the screen with a modal.
    m2mFeature({
      property: 'tags',
      through: 'productTags',
      localKey: 'productId',
      foreignKey: 'tagId',
      reference: 'tags',
      extraFields: ['position'],
      picker: 'combobox',
    }),
  ],
})
export class ProductsAdminController extends AdminController<ProductRow> {
  /** Augments the default list response with an in-stock count. */
  override async list(ctx: ListContext<ProductRow>): Promise<ListActionResponse> {
    const base = await super.list(ctx)
    let inStockCount = 0
    try {
      inStockCount = await this.resource.count(
        new Filter({ inStock: true }, this.resource),
      )
    } catch {
      // Adapter doesn't support boolean-by-string filter; skip metric.
    }
    return { ...base, inStockCount }
  }

  @Action({
    actionType: 'record',
    name: 'archive',
    component: null,
    isVisible: (core) => core.record?.params.inStock === true,
    nesting: 'Inventory',
    custom: { icon: 'Archive', label: 'Archive' },
  })
  async archive(ctx: AdminActionContext<ProductRow>): Promise<RecordActionResponse> {
    const record = ctx.record!
    await record.update({ inStock: false, quantity: 0 })
    return {
      record: record.toJSON(),
      notice: { message: `Archived ${record.params.name as string}`, type: 'success' },
    }
  }

  @Action({
    actionType: 'record',
    name: 'restock',
    component: null,
    isVisible: (core) => core.record?.params.inStock !== true,
    nesting: 'Inventory',
    custom: { icon: 'PackageCheck', label: 'Restock' },
  })
  async restock(ctx: AdminActionContext<ProductRow>): Promise<RecordActionResponse> {
    const record = ctx.record!
    await record.update({
      inStock: true,
      quantity: Math.max(Number(record.params.quantity ?? 0), 25),
    })
    return {
      record: record.toJSON(),
      notice: { message: `Restocked ${record.params.name as string}`, type: 'success' },
    }
  }

  @Action({
    actionType: 'record',
    name: 'duplicateSku',
    component: null,
    nesting: [{ name: 'Utilities', icon: 'Wrench' }, 'Identifiers'],
    custom: { icon: 'Copy', label: 'Duplicate SKU' },
  })
  async duplicateSku(ctx: AdminActionContext<ProductRow>): Promise<RecordActionResponse> {
    const record = ctx.record!
    await record.update({ sku: uuidv7() })
    return {
      record: record.toJSON(),
      notice: { message: `Generated a new SKU for ${record.params.name as string}`, type: 'info' },
    }
  }

  @Action({
    actionType: 'resource',
    name: 'markFeaturedPalette',
    component: null,
    nesting: [{ name: 'Merchandising', icon: 'Palette' }, 'Colors'],
    custom: { icon: 'Palette', label: 'Apply featured palette' },
  })
  async markFeaturedPalette(): Promise<ActionResponse> {
    const palette = ['#0f172a', '#1d4ed8', '#7c3aed', '#be123c', '#0f766e', '#c2410c']
    const records = await this.resource.find(new Filter({}, this.resource), {
      limit: palette.length,
      offset: 0,
    })
    for (let i = 0; i < records.length; i++) {
      await records[i]!.update({ accentColor: palette[i % palette.length]! })
    }
    return {
      notice: { message: 'Applied featured accent colors to demo products', type: 'success' },
    }
  }

  /**
   * Resource-level action with a custom UI. The operator opens
   * `/resources/products/actions/bulkRepriceUi`, the `bulk-reprice` component
   * renders a form, and only the submit lands here as a POST.
   *
   * The GET branch primes that form — it hands back the current price span so
   * the component can show what it is about to change.
   */
  @Action({
    actionType: 'resource',
    name: 'bulkRepriceUi',
    component: 'bulk-reprice',
    nesting: [{ name: 'Merchandising', icon: 'Palette' }],
    custom: { icon: 'Tag', label: 'Bulk reprice' },
    invalidates: true,
  })
  async bulkRepriceUi(ctx: AdminActionContext<ProductRow>): Promise<ActionResponse> {
    const filter = new Filter({}, this.resource)
    const records = await this.resource.find(filter, { limit: 500, offset: 0 })
    const prices = records
      .map((r) => Number(r.params.price))
      .filter((n) => Number.isFinite(n))

    if (ctx.request.method !== 'post') {
      return {
        total: records.length,
        minPrice: prices.length ? Math.min(...prices) : 0,
        maxPrice: prices.length ? Math.max(...prices) : 0,
      }
    }

    const percent = Number(ctx.request.payload?.percent)
    if (!Number.isFinite(percent) || percent === 0) {
      return { notice: { message: 'Enter a non-zero percentage', type: 'error' } }
    }
    for (const record of records) {
      const current = Number(record.params.price)
      if (!Number.isFinite(current)) continue
      await record.update({ price: Math.round(current * (1 + percent / 100) * 100) / 100 })
    }
    return {
      updated: records.length,
      notice: {
        message: `Repriced ${records.length} products by ${percent}%`,
        type: 'success',
      },
    }
  }
}
