// @modern-admin/feature-upload — file upload plugin for modern-admin resources.
//
// Usage:
//   import { uploadFeature, LocalUploadProvider, S3UploadProvider } from '@modern-admin/feature-upload'
//   import { ModernAdminUploadModule } from '@modern-admin/feature-upload/nest'

export { uploadFeature } from './upload-feature.js'
export { UploadProviderRegistry } from './registry.js'
export { PendingUploadsRegistry } from './pending-registry.js'

// Path-safety helpers (shared by providers + custom upload backends).
export { isUnsafeKey, sanitizeFilename, resolveWithinDir } from './path-safety.js'
// Server-side MIME allow-list matcher (HTML `accept` syntax).
export { mimeMatches } from './mime.js'

// Built-in providers
export { LocalUploadProvider, type LocalUploadOptions } from './providers/local.js'
export { S3UploadProvider, type S3UploadOptions } from './providers/s3.js'

// Types
export type {
  IUploadProvider,
  UploadedFile,
  UploadedFileInfo,
  UploadFeatureOptions,
  UploadPropertyConfig,
} from './types.js'
