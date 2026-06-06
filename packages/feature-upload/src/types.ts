/**
 * Core types for the upload feature plugin.
 *
 * `IUploadProvider` is the single port contract that upload backends must
 * implement. `LocalUploadProvider` and `S3UploadProvider` ship as built-in
 * adapters; custom providers only need to implement these four methods.
 */

/** Parsed file data received from a multipart request. */
export interface UploadedFile {
  /** Original filename from the client. */
  originalName: string
  /** MIME type reported by the client (e.g. 'image/jpeg'). */
  mimeType: string
  /** File size in bytes. */
  size: number
  /** Raw file bytes. */
  buffer: Buffer
}

/** Metadata returned by the upload endpoint. */
export interface UploadedFileInfo {
  /** Storage key (relative path or object key). Stored in the DB field. */
  key: string
  /** Public URL for browser display / download. */
  url: string
  /** Original filename. */
  name: string
  /** Size in bytes. */
  size: number
  /** MIME type. */
  mimeType: string
}

/**
 * Upload provider port. Implement this interface to add a new storage backend.
 *
 * @example
 * class GcsUploadProvider implements IUploadProvider {
 *   async upload(file) { ... }
 *   getUrl(key) { ... }
 *   async delete(key) { ... }
 * }
 */
export interface IUploadProvider {
  /**
   * Upload a file and return its storage key.
   * The key is the value that will be persisted in the database field.
   *
   * @param file  Parsed file data from the multipart request.
   * @param key   Optional pre-computed storage key (from `uploadPath`). When
   *              omitted the provider generates a key internally (UUID + extension).
   */
  upload(file: UploadedFile, key?: string): Promise<string>

  /**
   * Compute the public URL for a stored key. May be sync or async.
   * Used both by the upload endpoint (to return the URL) and by the frontend
   * URL template when `urlTemplate()` is not implemented.
   */
  getUrl(key: string): string | Promise<string>

  /**
   * Delete the file identified by `key`. Must not throw if the file does not
   * exist (e.g. was already deleted or was never stored).
   */
  delete(key: string): Promise<void>

  /**
   * Optional URL template string for the frontend to construct display URLs
   * from stored keys without calling the backend.
   * Use `{key}` as the placeholder, e.g. `'https://cdn.example.com/{key}'`.
   * Return `undefined` (or omit the method) when URLs cannot be statically
   * computed (e.g. signed/pre-signed S3 URLs — each URL is unique and time-limited).
   */
  urlTemplate?(): string | undefined
}

/** Per-property upload configuration passed to `uploadFeature()`. */
export interface UploadPropertyConfig {
  /** Storage provider for this property. */
  provider: IUploadProvider
  /**
   * Allowed MIME type patterns (same syntax as the HTML `accept` attribute).
   * Examples: `['image/*']`, `['image/jpeg', 'application/pdf']`.
   * Enforcement is advisory on the frontend; the controller does not re-validate.
   */
  mimeTypes?: string[]
  /** Maximum upload size in bytes. Advisory (frontend warning only). */
  maxSize?: number
  /**
   * Treat the property as an array of file keys (multi-file upload).
   * When true, the property is stored as `string[]`, the editor allows
   * uploading multiple files (a single multipart request can include several),
   * and the action hooks diff arrays on edit and delete every key on delete.
   */
  isArray?: boolean
  /**
   * Custom storage key generator. Receives the original filename from the
   * client and returns the key to use for storage.
   *
   * Use this to organise files into sub-directories, include the resource
   * name, add timestamps, etc.  The provider's internal UUID generator is
   * used when this is omitted.
   *
   * @example
   * // avatars/2024/01/uuid.jpg
   * uploadPath: (filename) => {
   *   const ext = filename.split('.').pop()
   *   const d = new Date()
   *   return `avatars/${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${uuidv7()}.${ext}`
   * }
   *
   * @example
   * // resource-specific prefix
   * uploadPath: (filename) => `products/images/${uuidv7()}-${filename}`
   */
  uploadPath?: (filename: string) => string
}

/** Options passed to `uploadFeature()`. */
export interface UploadFeatureOptions {
  /**
   * Map from property path to its upload configuration.
   * Each entry makes the property a `type: 'file'` field wired to the
   * specified provider.
   *
   * @example
   * uploadFeature({
   *   properties: {
   *     avatar: { provider: new LocalUploadProvider({ uploadDir: './uploads', baseUrl: '/uploads' }) },
   *     resume: { provider: new S3UploadProvider({ bucket: 'my-bucket', region: 'us-east-1' }), mimeTypes: ['application/pdf'] },
   *   },
   * })
   */
  properties: Record<string, UploadPropertyConfig>
}
