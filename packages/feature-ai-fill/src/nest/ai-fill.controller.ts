/**
 * AiFillController — handles "fill form from photo" requests.
 *
 * Endpoint
 * --------
 *   POST /admin/api/resources/:resourceId/ai-fill
 *     Content-Type: multipart/form-data
 *     Body: a file field named `image` containing the photo to recognise.
 *     Returns `AiFillResponse` — { values: { fieldPath: extractedValue, … } }.
 *
 * The URL lives outside the `actions/` namespace so it cannot be shadowed by
 * `ResourceController`'s generic `POST actions/:action` route regardless of
 * module registration order.
 *
 * Authorisation: `ModernAdminAuthGuard` (authentication) + full permission
 * gate inside `AiFillService.fill()` via `admin.invoke()`.
 * Rate limiting: `AiFillThrottlerGuard` — respects `throttle: false` option.
 */

import {
  BadRequestException,
  Controller,
  ExecutionContext,
  Inject,
  Injectable,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { type ThrottlerModuleOptions, ThrottlerGuard, ThrottlerStorage } from '@nestjs/throttler'
import { Reflector } from '@nestjs/core'
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger'
import type { IncomingMessage } from 'node:http'
import Busboy from 'busboy'
import { ModernAdminAuthGuard } from '@modern-admin/nest'
import { AiFillService } from './ai-fill.service.js'
import { AI_FILL_MODULE_OPTIONS, type ModernAdminAiFillModuleOptions } from './ai-fill.tokens.js'
import type { AiFillResponse } from '../types.js'

// ─── Throttler guard ──────────────────────────────────────────────────────────

/**
 * Thin wrapper around `ThrottlerGuard` that honours the module's
 * `throttle: false` escape hatch (e.g. for test/dev environments).
 * When disabled, every request passes without any Redis/memory lookup.
 */
@Injectable()
export class AiFillThrottlerGuard extends ThrottlerGuard {
  private readonly disabled: boolean

  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    @Inject(AI_FILL_MODULE_OPTIONS) moduleOptions: ModernAdminAiFillModuleOptions,
  ) {
    super(options, storageService, reflector)
    this.disabled = moduleOptions.throttle === false
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.disabled) return true
    return super.canActivate(context)
  }
}

// ─── Multipart parser ─────────────────────────────────────────────────────────

interface ParsedImage {
  buffer: Buffer
  mimeType: string
  size: number
}

interface AdminRequest extends IncomingMessage {
  currentAdmin?: { id: string; [key: string]: unknown }
}

/**
 * Read the `image` field from a multipart/form-data request. Other file
 * fields are drained and discarded. The buffer is forwarded directly to the
 * AI model — the file is never written to disk.
 */
function parseImageField(req: IncomingMessage, maxBytes: number): Promise<ParsedImage> {
  return new Promise((resolve, reject) => {
    let bb: ReturnType<typeof Busboy>
    try {
      bb = Busboy({
        headers: req.headers as Record<string, string>,
        limits: { files: 1, fileSize: maxBytes + 1 },
      })
    } catch {
      reject(new BadRequestException('Request is not multipart/form-data'))
      return
    }

    let image: ParsedImage | undefined
    let settled = false
    let firstError: unknown

    const resolveOnce = (value: ParsedImage): void => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const rejectOnce = (err: unknown): void => {
      if (settled) return
      settled = true
      reject(err)
    }

    // Propagate client disconnects / stream errors to the promise.
    req.on('error', rejectOnce)

    bb.on('file', (fieldname, stream, info) => {
      // Drain and discard any field that is not named 'image'.
      if (fieldname !== 'image') {
        stream.resume()
        return
      }
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('limit', () => {
        firstError = new BadRequestException(
          `Image exceeds the maximum allowed size of ${maxBytes} bytes.`,
        )
        stream.resume()
      })
      stream.on('end', () => {
        if (image) return // duplicate field — ignore
        const buffer = Buffer.concat(chunks)
        image = {
          buffer,
          mimeType: info.mimeType || 'application/octet-stream',
          size: buffer.length,
        }
      })
      stream.on('error', (err) => {
        firstError = firstError ?? err
      })
    })

    bb.on('finish', () => {
      if (firstError) {
        rejectOnce(firstError)
      } else if (!image) {
        rejectOnce(new BadRequestException('No "image" field found in the request body'))
      } else {
        resolveOnce(image)
      }
    })

    bb.on('error', rejectOnce)
    req.pipe(bb)
  })
}

// ─── Controller ───────────────────────────────────────────────────────────────

@ApiTags('Admin / AI Fill')
@ApiCookieAuth('session')
@Controller('admin/api/resources/:resourceId')
@UseGuards(ModernAdminAuthGuard, AiFillThrottlerGuard)
export class AiFillController {
  constructor(private readonly service: AiFillService) {}

  @Post('ai-fill')
  async fill(
    @Param('resourceId') resourceId: string,
    @Req() req: AdminRequest,
  ): Promise<AiFillResponse> {
    const image = await parseImageField(req, this.service.maxImageBytes)
    return this.service.fill(resourceId, image, req.currentAdmin)
  }
}
