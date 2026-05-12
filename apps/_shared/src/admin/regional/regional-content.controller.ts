// RegionalContent — showcases `jsonByKeyFeature`.
//
// The DB row stores `titles` and `previews` as JSON columns:
//
//   titles:   { eu: 'Holiday Sale (EU)',  us: 'Holiday Sale (US)',  asia: '...' }
//   previews: { eu: 'previews/eu/uuid.jpg', us: 'previews/us/uuid.jpg', asia: '...' }
//
// On the form they appear as N virtual fields (`titles__eu`, `previews__us`, …)
// gated by the `region` enum — switch the enum, and only the corresponding
// editors are visible. File uploads route through the standard upload
// controller via providers registered eagerly by the feature.

import { extname } from 'node:path'
import { uuidv7 } from '@modern-admin/core'
import { LocalUploadProvider } from '@modern-admin/feature-upload'
import { jsonByKeyFeature } from '@modern-admin/feature-json-by-key'
import { AdminController, AdminResource } from '@modern-admin/nest'
import { adminSource } from '../source-registry.js'
import type { RegionalContentRow } from '../types.js'

const regionalProvider = new LocalUploadProvider({
  uploadDir: './uploads',
  baseUrl: `http://localhost:${process.env.API_PORT ?? 3001}/uploads`,
})

const REGIONS = ['eu', 'us', 'asia'] as const
const REGION_LABELS: Record<string, string> = {
  eu: 'Europe',
  us: 'United States',
  asia: 'Asia-Pacific',
}

@AdminResource({
  source: () => adminSource('regionalContent'),
  navigation: { icon: 'Globe', group: 'Content' },
  listProperties: ['id', 'name', 'region', 'publishedAt'],
  features: [
    jsonByKeyFeature({
      controlField: 'region',
      keys: REGIONS,
      defaultKey: 'eu',
      properties: {
        titles: {
          child: { type: 'string', isRequired: true },
          label: (key) => `Title — ${REGION_LABELS[key] ?? key}`,
        },
        previews: {
          child: {
            type: 'file',
            upload: {
              provider: regionalProvider,
              mimeTypes: ['image/*'],
              maxSize: 10 * 1024 * 1024,
              uploadPath: (filename, ctx) =>
                `regional/${ctx.key}/${uuidv7()}${extname(filename)}`,
            },
          },
          label: (key) => `Preview — ${REGION_LABELS[key] ?? key}`,
        },
      },
    }),
  ],
})
export class RegionalContentAdminController extends AdminController<RegionalContentRow> {}
