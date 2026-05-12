// Products — showcases:
//   • the upload feature plugin (file/gallery uploads through busboy),
//   • overriding the built-in `list` to inject a computed `inStockCount`
//     into the response meta (visible from the React app's list view),
//   • record-level @Action handlers archive/restock/duplicateSku,
//   • a resource-level @Action `markFeaturedPalette` that mutates the
//     first six products through the shared adapter API.
//
// Adapter-portable: cross-resource access is done via `this.resource`
// or `this.admin.findResource(...)` rather than reaching into adapter
// internals.

import { extname } from 'node:path'
import { Filter, uuidv7 } from '@modern-admin/core'
import { uploadFeature, LocalUploadProvider } from '@modern-admin/feature-upload'
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
    m2mFeature({
      property: 'tags',
      through: 'productTags',
      localKey: 'productId',
      foreignKey: 'tagId',
      reference: 'tags',
      extraFields: ['position'],
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
}
