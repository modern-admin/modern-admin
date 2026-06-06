/**
 * S3UploadProvider — stores files in an AWS S3 bucket (or any S3-compatible
 * service such as MinIO, Cloudflare R2, DigitalOcean Spaces, etc.).
 *
 * Requires `@aws-sdk/client-s3` to be installed in the host project.
 * For streaming multipart upload of large files, also install `@aws-sdk/lib-storage`.
 * For pre-signed URLs (private buckets), install `@aws-sdk/s3-request-presigner`.
 *
 * @example AWS S3 — public bucket
 * new S3UploadProvider({ bucket: 'my-bucket', region: 'us-east-1', acl: 'public-read' })
 *
 * @example AWS S3 — private bucket with pre-signed URLs (60 min expiry)
 * new S3UploadProvider({ bucket: 'my-bucket', region: 'us-east-1', signed: { expiresIn: 3600 } })
 *
 * @example MinIO / custom endpoint
 * new S3UploadProvider({
 *   bucket: 'my-bucket',
 *   region: 'us-east-1',
 *   endpoint: 'http://localhost:9000',
 *   forcePathStyle: true,
 *   publicBaseUrl: 'http://localhost:9000/my-bucket',
 * })
 *
 * @example Inject a pre-configured S3Client (share across providers)
 * const s3 = new S3Client({ region: 'us-east-1' })
 * new S3UploadProvider({ bucket: 'my-bucket', region: 'us-east-1' }, s3)
 */

import { extname } from 'node:path'
import { uuidv7 } from '@modern-admin/core'
import type { IUploadProvider, UploadedFile } from '../types.js'

export interface S3UploadOptions {
  /** S3 bucket name. */
  bucket: string
  /** AWS region (e.g. `'us-east-1'`). */
  region: string
  /** AWS access key id. Falls back to environment / credential chain. */
  accessKeyId?: string
  /** AWS secret access key. Falls back to environment / credential chain. */
  secretAccessKey?: string
  /**
   * Custom endpoint for S3-compatible services.
   * @example 'http://localhost:9000'
   * @example 'https://nyc3.digitaloceanspaces.com'
   */
  endpoint?: string
  /** Force path-style URLs (required for some MinIO / custom endpoint setups). */
  forcePathStyle?: boolean
  /** Optional key prefix / "folder". Without trailing slash. */
  prefix?: string
  /**
   * Canned ACL applied to every uploaded object, e.g. `'public-read'`.
   * Omit for private buckets — use `signed` instead.
   */
  acl?: string
  /**
   * Override the public base URL used for `getUrl()` and `urlTemplate()`.
   * Useful when files are served via CloudFront or a custom CDN.
   * Without trailing slash.
   * @example 'https://cdn.example.com'
   */
  publicBaseUrl?: string
  /**
   * Generate pre-signed URLs instead of public URLs.
   * Required for private S3 buckets. Needs `@aws-sdk/s3-request-presigner`.
   *
   * - `true` uses the default expiry (3600 s / 1 hour).
   * - Pass `{ expiresIn: seconds }` to customise.
   *
   * When `signed` is set, `urlTemplate()` is not implemented (each URL is
   * unique and time-limited) and `getUrl()` is async.
   *
   * @example
   * signed: true          // 1-hour pre-signed URLs
   * signed: { expiresIn: 60 * 60 * 24 }  // 24-hour pre-signed URLs
   */
  signed?: boolean | { expiresIn?: number }
}

export class S3UploadProvider implements IUploadProvider {

  private _client: any = null

  constructor(
    private readonly options: S3UploadOptions,
    // Accept a pre-configured S3Client instance (share across providers /
    // inject in tests). When omitted the provider creates its own client.

    private readonly injectedClient?: any,
  ) {}


  private async client(): Promise<any> {
    if (this.injectedClient) return this.injectedClient
    if (this._client) return this._client
    let S3Client: unknown
    try {
      const mod = await import('@aws-sdk/client-s3' as string)
      S3Client = (mod as { S3Client: unknown }).S3Client
    } catch {
      throw new Error(
        '[modern-admin/feature-upload] S3UploadProvider requires @aws-sdk/client-s3. ' +
          'Install it: bun add @aws-sdk/client-s3',
      )
    }
    const cfg: Record<string, unknown> = {
      region: this.options.region,
      ...(this.options.endpoint ? { endpoint: this.options.endpoint } : {}),
      ...(this.options.forcePathStyle ? { forcePathStyle: true } : {}),
    }
    if (this.options.accessKeyId && this.options.secretAccessKey) {
      cfg.credentials = {
        accessKeyId: this.options.accessKeyId,
        secretAccessKey: this.options.secretAccessKey,
      }
    }
    this._client = new (S3Client as new (cfg: Record<string, unknown>) => unknown)(cfg)
    return this._client
  }

  async upload(file: UploadedFile, key?: string): Promise<string> {
    const c = await this.client()
    const ext = extname(file.originalName)
    const prefix = this.options.prefix ? `${this.options.prefix}/` : ''
    const resolvedKey = key ?? `${prefix}${uuidv7()}${ext}`

    // Prefer @aws-sdk/lib-storage for streaming multipart uploads (large files).
    // Fall back to PutObjectCommand if lib-storage is not installed.
    try {
      const libStorage = await import('@aws-sdk/lib-storage' as string)
      const Upload = (libStorage as { Upload: new (i: Record<string, unknown>) => { done(): Promise<unknown> } }).Upload
      const input: Record<string, unknown> = {
        Bucket: this.options.bucket,
        Key: resolvedKey,
        Body: file.buffer,
        ContentType: file.mimeType,
      }
      if (this.options.acl) input.ACL = this.options.acl
      const uploader = new Upload({ client: c, params: input })
      await uploader.done()
    } catch (err) {
      // lib-storage not installed — fall back to PutObjectCommand.
      if ((err as { code?: string }).code === 'ERR_MODULE_NOT_FOUND' ||
          String(err).includes('Cannot find module')) {
        const sdk = await import('@aws-sdk/client-s3' as string)
        const PutObjectCommand = (sdk as { PutObjectCommand: new (i: Record<string, unknown>) => unknown }).PutObjectCommand
        const input: Record<string, unknown> = {
          Bucket: this.options.bucket,
          Key: resolvedKey,
          Body: file.buffer,
          ContentType: file.mimeType,
          ContentLength: file.size,
        }
        if (this.options.acl) input.ACL = this.options.acl
        await (c as { send: (cmd: unknown) => Promise<void> }).send(new PutObjectCommand(input))
      } else {
        throw err
      }
    }

    return resolvedKey
  }

  async getUrl(key: string): Promise<string> {
    if (this.options.signed) {
      return this.signedUrl(key)
    }
    return `${this.publicBaseUrl()}/${key}`
  }

  async delete(key: string): Promise<void> {
    try {
      const sdk = await import('@aws-sdk/client-s3' as string)
      const c = await this.client()
      const DeleteObjectCommand = (sdk as { DeleteObjectCommand: new (i: Record<string, unknown>) => unknown }).DeleteObjectCommand
      await (c as { send: (cmd: unknown) => Promise<void> }).send(
        new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }),
      )
    } catch {
      // Ignore — file may not exist.
    }
  }

  /**
   * URL template for the frontend. Only available when `signed` is NOT set
   * (public buckets). For private buckets each URL is unique + time-limited,
   * so the frontend must call the upload endpoint to get a fresh URL.
   */
  urlTemplate(): string | undefined {
    if (this.options.signed) return undefined
    return `${this.publicBaseUrl()}/{key}`
  }

  private async signedUrl(key: string): Promise<string> {
    let getSignedUrl: unknown
    try {
      const mod = await import('@aws-sdk/s3-request-presigner' as string)
      getSignedUrl = (mod as { getSignedUrl: unknown }).getSignedUrl
    } catch {
      throw new Error(
        '[modern-admin/feature-upload] Signed URLs require @aws-sdk/s3-request-presigner. ' +
          'Install it: bun add @aws-sdk/s3-request-presigner',
      )
    }
    const sdk = await import('@aws-sdk/client-s3' as string)
    const c = await this.client()
    const GetObjectCommand = (sdk as { GetObjectCommand: new (i: Record<string, unknown>) => unknown }).GetObjectCommand
    const expiresIn =
      typeof this.options.signed === 'object'
        ? (this.options.signed.expiresIn ?? 3600)
        : 3600

    return (getSignedUrl as (
      client: unknown,
      command: unknown,
      opts: { expiresIn: number },
    ) => Promise<string>)(c, new GetObjectCommand({ Bucket: this.options.bucket, Key: key }), { expiresIn })
  }

  private publicBaseUrl(): string {
    if (this.options.publicBaseUrl) return this.options.publicBaseUrl
    if (this.options.endpoint) return `${this.options.endpoint}/${this.options.bucket}`
    return `https://${this.options.bucket}.s3.${this.options.region}.amazonaws.com`
  }
}
