/**
 * UploadController — handles file uploads for `type: 'file'` properties.
 *
 * Endpoints
 * ---------
 *   POST   /admin/api/resources/:resourceId/actions/upload?field=<propertyPath>
 *     Content-Type: multipart/form-data
 *     Accepts one or more files (any field names). Returns `UploadedFileInfo[]` —
 *     callers writing to a single-value `'file'` property take the first item;
 *     `isArray: true` properties consume the whole array.
 *
 *   DELETE /admin/api/resources/:resourceId/actions/upload?field=<path>&key=<key>
 *     Cancels a still-pending upload (uploaded but not yet saved). Calls
 *     `PendingUploadsRegistry.cancel(key)` which deletes the file from
 *     storage. No-op (404) if the key is no longer pending — protects already
 *     persisted files from being deleted via this endpoint.
 *
 * Authorisation re-uses `ModernAdminAuthGuard` from `@modern-admin/nest` —
 * requires `ModernAdminModule.forRoot()` to be registered (globally or as a
 * parent module).
 */

import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  HttpCode,
  Inject,
  InternalServerErrorException,
  NotFoundException,
  PayloadTooLargeException,
  Post,
  Param,
  Query,
  Req,
  UnsupportedMediaTypeException,
  UseGuards,
} from '@nestjs/common'
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger'
import type { IncomingMessage } from 'node:http'
import Busboy from 'busboy'
import {
  ForbiddenError,
  ResourceNotFoundError,
  type ModernAdmin,
} from '@modern-admin/core'
import { MODERN_ADMIN, ModernAdminAuthGuard } from '@modern-admin/nest'
import { UploadProviderRegistry } from '../registry.js'
import { PendingUploadsRegistry } from '../pending-registry.js'
import { isUnsafeKey, sanitizeFilename } from '../path-safety.js'
import { mimeMatches } from '../mime.js'
import { UPLOAD_MODULE_OPTIONS, type ModernAdminUploadModuleOptions } from './upload.tokens.js'
import type { UploadedFile, UploadedFileInfo } from '../types.js'

/** Default hard cap on a single buffered file (bytes) — 25 MiB. */
const DEFAULT_MAX_FILE_SIZE = 25 * 1024 * 1024
/** Default cap on files per multipart request for `isArray` properties. */
const DEFAULT_MAX_FILES = 20

/** Server-side limits enforced while parsing a multipart upload. */
interface ParseLimits {
  /** Hard per-file byte cap. Streams exceeding it are rejected (413). */
  maxFileSize: number
  /** Max files per request. Excess files are rejected (400). */
  maxFiles: number
  /** Allowed MIME patterns (HTML `accept` syntax). Empty ⇒ no restriction. */
  mimeTypes?: string[]
}

/**
 * Reads every file from a multipart/form-data stream using busboy, enforcing
 * size / count / MIME limits *as it streams* so a hostile request cannot
 * buffer unbounded bytes into memory before any check runs.
 */
function parseAllFiles(req: IncomingMessage, limits: ParseLimits): Promise<UploadedFile[]> {
  return new Promise((resolve, reject) => {
    let bb: ReturnType<typeof Busboy>
    try {
      bb = Busboy({
        headers: req.headers as Record<string, string>,
        limits: {
          fileSize: limits.maxFileSize,
          files: limits.maxFiles,
          // The upload endpoint carries no data fields — keep them tightly
          // bounded so field spam cannot buffer memory either.
          fields: 10,
          fieldSize: 100 * 1024,
        },
      })
    } catch {
      reject(new BadRequestException('Request is not multipart/form-data'))
      return
    }

    const files: UploadedFile[] = []
    /** Number of streams that have started but not yet ended. */
    let pending = 0
    let finished = false
    let settled = false
    let firstError: unknown

    const fail = (err: unknown): void => {
      firstError = firstError ?? err
    }

    const tryResolve = (): void => {
      if (settled || !finished || pending > 0) return
      settled = true
      if (firstError) reject(firstError)
      else if (files.length === 0) reject(new BadRequestException('No file found in request body'))
      else resolve(files)
    }

    bb.on('file', (_fieldname, stream, info) => {
      pending++
      // Reject a disallowed MIME up front — don't buffer a single byte of it.
      const mimeType = info.mimeType || 'application/octet-stream'
      if (!mimeMatches(mimeType, limits.mimeTypes)) {
        fail(new UnsupportedMediaTypeException(`File type "${mimeType}" is not allowed`))
        stream.resume() // drain so busboy keeps parsing the rest of the body
        stream.on('close', () => {
          pending--
          tryResolve()
        })
        return
      }
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      // Busboy emits 'limit' when the per-file byte cap is exceeded.
      stream.on('limit', () => {
        fail(new PayloadTooLargeException(`File exceeds the maximum size of ${limits.maxFileSize} bytes`))
      })
      stream.on('end', () => {
        // `truncated` is set when the fileSize limit tripped mid-stream.
        if (!(stream as { truncated?: boolean }).truncated) {
          const buffer = Buffer.concat(chunks)
          files.push({
            // Sanitise before the name can steer key generation (extname /
            // custom uploadPath) — strips separators and traversal segments.
            originalName: sanitizeFilename(info.filename),
            mimeType,
            size: buffer.length,
            buffer,
          })
        }
        pending--
        tryResolve()
      })
      stream.on('error', (err) => {
        fail(err)
        pending--
        tryResolve()
      })
    })

    // Busboy stops emitting files past the `files` limit — surface it as a 400
    // rather than silently dropping the extras.
    bb.on('filesLimit', () => {
      fail(new BadRequestException(`Too many files — at most ${limits.maxFiles} allowed`))
    })

    bb.on('finish', () => {
      finished = true
      tryResolve()
    })

    bb.on('error', (err: unknown) => {
      fail(err)
      finished = true
      tryResolve()
    })

    req.pipe(bb)
  })
}

@ApiTags('Admin / Uploads')
@ApiCookieAuth('session')
@Controller('admin/api/resources/:resourceId/actions')
@UseGuards(ModernAdminAuthGuard)
export class UploadController {
  constructor(
    @Inject(MODERN_ADMIN) private readonly admin: ModernAdmin,
    @Inject(UPLOAD_MODULE_OPTIONS) private readonly moduleOptions: ModernAdminUploadModuleOptions,
  ) {}

  /**
   * Upload one or more files for a specific resource property.
   *
   * @param resourceId  Admin resource id (e.g. `'users'`)
   * @param field       Property path (e.g. `'avatar'` / `'gallery'`)
   * @param req         Raw Express / Node.js `IncomingMessage`
   */
  @Post('upload')
  async upload(
    @Param('resourceId') resourceId: string,
    @Query('field') field: string,
    @Req() req: IncomingMessage,
  ): Promise<UploadedFileInfo[]> {
    const { providerId, registered } = this.resolveProperty(resourceId, field)

    // 1 — Parse the multipart body (collect every file), enforcing size /
    //     count / MIME limits while streaming so nothing unbounded is buffered.
    const moduleMax = this.moduleOptions.maxFileSize ?? DEFAULT_MAX_FILE_SIZE
    // Per-property maxSize tightens the cap but can never raise it above the
    // module-wide hard bound.
    const maxFileSize = Math.min(moduleMax, registered.maxSize ?? Number.POSITIVE_INFINITY)
    const maxFiles = registered.isArray
      ? (this.moduleOptions.maxFiles ?? DEFAULT_MAX_FILES)
      : 1
    const files = await parseAllFiles(req, {
      maxFileSize,
      maxFiles,
      ...(registered.mimeTypes ? { mimeTypes: registered.mimeTypes } : {}),
    })

    // 2 — If the property is single-value, only the first file is honoured.
    //     The frontend sends one anyway; this is a safety bound.
    const accepted = registered.isArray ? files : files.slice(0, 1)

    // 3 — Upload each file, computing the storage key per-file so a custom
    //     `uploadPath` generator can produce unique keys for each upload.
    const ttlMs = this.moduleOptions.pendingTtlMs ?? 60 * 60 * 1000
    const results: UploadedFileInfo[] = []
    for (const file of accepted) {
      const computedKey = registered.uploadPath ? registered.uploadPath(file.originalName) : undefined
      // A custom `uploadPath` could still produce a traversal/absolute key —
      // reject at the boundary (the provider also contains it defensively).
      if (computedKey !== undefined && isUnsafeKey(computedKey)) {
        throw new BadRequestException('Computed upload key is not allowed')
      }
      const key = await registered.provider.upload(file, computedKey)
      // Track as pending — it will be confirmed by `new.after`/`edit.after`
      // when the form is saved, or cleaned up by the sweeper when the TTL
      // expires (whichever comes first).
      PendingUploadsRegistry.track(key, providerId, ttlMs)
      const url = await registered.provider.getUrl(key)
      results.push({ key, url, name: file.originalName, size: file.size, mimeType: file.mimeType })
    }
    return results
  }

  /**
   * Cancel a still-pending upload — delete the file from storage immediately.
   * Used by the editor when the user removes a file *before* saving the form.
   *
   * Returns 204 if the cancel succeeded, 404 if the key is not pending.
   * The "not pending" branch protects already-persisted files: once a file
   * has been confirmed via the action hooks it can no longer be removed via
   * this endpoint — only via the regular edit/delete actions.
   */
  @Delete('upload')
  @HttpCode(204)
  async cancel(
    @Param('resourceId') resourceId: string,
    @Query('field') field: string,
    @Query('key') key: string,
  ): Promise<void> {
    if (!key) throw new BadRequestException('Missing "key" query parameter')
    if (isUnsafeKey(key)) throw new BadRequestException('Invalid "key" query parameter')
    // Validate that the resource/field is actually upload-enabled. This avoids
    // leaking the existence of arbitrary resource ids to unauthenticated callers
    // (the auth guard already requires authentication).
    this.resolveProperty(resourceId, field)
    const cancelled = await PendingUploadsRegistry.cancel(key)
    if (!cancelled) {
      throw new NotFoundException('Key is not pending — already saved or unknown')
    }
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  /** Resolve the resource + property and ensure it is wired to an upload provider. */
  private resolveProperty(
    resourceId: string,
    field: string,
  ): { providerId: string; registered: NonNullable<ReturnType<typeof UploadProviderRegistry.get>> } {
    let resource: ReturnType<typeof this.admin.findResource>
    try {
      resource = this.admin.findResource(resourceId)
    } catch (err) {
      if (err instanceof ResourceNotFoundError) throw new NotFoundException(err.message)
      if (err instanceof ForbiddenError) throw new ForbiddenException(err.message)
      throw err
    }

    const decorator = resource.decorate()
    const prop = decorator.getPropertyByKey(field)
    if (!prop) {
      throw new NotFoundException(`Property "${field}" not found on resource "${resourceId}"`)
    }

    const propJson = prop.toJSON()
    const providerId = propJson.custom?.uploadProviderId as string | undefined
    if (!providerId) {
      throw new BadRequestException(
        `Property "${field}" on resource "${resourceId}" is not configured for upload. ` +
          'Apply uploadFeature() to the resource.',
      )
    }

    const registered = UploadProviderRegistry.get(providerId)
    if (!registered) {
      throw new InternalServerErrorException(`Upload provider "${providerId}" is not registered.`)
    }
    return { providerId, registered }
  }
}
