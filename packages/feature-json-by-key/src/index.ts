// `@modern-admin/feature-json-by-key` — declarative fan-out of a JSON column
// into N virtual sub-properties on the admin form, gated by a control field.

export { jsonByKeyFeature } from './json-by-key-feature.js'
export type {
  JsonByKeyFeatureOptions,
  JsonByKeyPropertyConfig,
  JsonByKeyChildConfig,
  JsonByKeyUploadConfig,
  JsonByKeyUploadContext,
  JsonByKeyCustomData,
} from './types.js'
