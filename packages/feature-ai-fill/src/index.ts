// @modern-admin/feature-ai-fill — AI-powered "fill form from photo" plugin.
//
// Usage:
//   import { aiFillFeature } from '@modern-admin/feature-ai-fill'
//   import { ModernAdminAiFillModule } from '@modern-admin/feature-ai-fill/nest'

export { aiFillFeature, AI_FILL_ACTION_NAME } from './ai-fill-feature.js'
export { buildAiFillSchema } from './schema-builder.js'
export type { BuiltAiFillSchema } from './schema-builder.js'
export type {
  AiFillFeatureOptions,
  AiFillFieldConfig,
  AiFillResponse,
} from './types.js'
