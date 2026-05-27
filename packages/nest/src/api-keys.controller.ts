import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  NotImplementedException,
  Optional,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger'
import { type ModernAdmin, type CurrentAdmin, uuidv7 } from '@modern-admin/core'
import { z } from 'zod'
import { MODERN_ADMIN, MODERN_ADMIN_API_KEY_SERVICE, MODERN_ADMIN_OPTIONS } from './tokens.js'
import { ModernAdminAuthGuard } from './auth.guard.js'
import type { ModernAdminModuleOptions } from './module.js'

interface AdminRequest {
  currentAdmin?: CurrentAdmin
  headers: Record<string, string | string[] | undefined>
}

/**
 * Wire row exposed to the frontend. Mirrors what better-auth's api-key
 * plugin returns minus the secret. `permissions` is normalised to an
 * empty object when absent so consumers don't have to null-guard.
 */
export interface ApiKeyResponse {
  id: string
  name: string | null
  start: string | null
  prefix: string | null
  enabled: boolean
  permissions: Record<string, string[]>
  expiresAt: string | null
  lastRequest: string | null
  createdAt: string
  updatedAt: string
}

interface ApiKeyRowLike {
  id: string
  name: string | null
  start: string | null
  prefix: string | null
  enabled: boolean
  permissions?: Record<string, string[]> | null
  expiresAt: Date | string | null
  lastRequest: Date | string | null
  createdAt: Date | string
  updatedAt: Date | string
}

interface ApiKeyCreatedRow extends ApiKeyRowLike {
  /** Plaintext secret — returned only once, on creation. */
  key: string
}

type ApiKeyListResult =
  | ApiKeyRowLike[]
  | { keys: ApiKeyRowLike[] }
  | { apiKeys: ApiKeyRowLike[] }

/**
 * Transport-agnostic surface the controller depends on. The host app
 * provides an implementation (typically by adapting better-auth's
 * `auth.api`); when no implementation is registered, every endpoint
 * returns 501.
 */
export interface IApiKeyService {
  list(headers: Headers): Promise<ApiKeyListResult>
  create(
    body: { name: string; expiresIn: number | null | undefined; permissions: Record<string, string[]> },
    headers: Headers,
  ): Promise<ApiKeyCreatedRow>
  update(
    body: {
      keyId: string
      name?: string
      enabled?: boolean
      permissions?: Record<string, string[]> | null
      expiresIn?: number | null
    },
    headers: Headers,
  ): Promise<ApiKeyRowLike>
  delete(keyId: string, headers: Headers): Promise<{ success: boolean }>
}

const permissionsZ = z.record(z.string().min(1), z.array(z.string().min(1)))

const createBodyZ = z.object({
  name: z.string().min(1).max(64),
  /** Days from now until the key expires. `null` = never. */
  expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
  permissions: permissionsZ,
})

const updateBodyZ = z.object({
  name: z.string().min(1).max(64).optional(),
  enabled: z.boolean().optional(),
  permissions: permissionsZ.optional(),
  /** Days from now to extend the expiry; `null` clears the expiry. */
  expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
})

const DAY_MS = 24 * 60 * 60 * 1000

const toHeaders = (raw: Record<string, string | string[] | undefined>): Headers => {
  const h = new Headers()
  for (const [k, v] of Object.entries(raw)) {
    if (v == null) continue
    if (Array.isArray(v)) v.forEach((item) => h.append(k, item))
    else h.set(k, v)
  }
  return h
}

const toResponse = (row: ApiKeyRowLike): ApiKeyResponse => ({
  id: row.id,
  name: row.name,
  start: row.start,
  prefix: row.prefix,
  enabled: row.enabled,
  permissions: row.permissions ?? {},
  expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
  lastRequest: row.lastRequest ? new Date(row.lastRequest).toISOString() : null,
  createdAt: new Date(row.createdAt).toISOString(),
  updatedAt: new Date(row.updatedAt).toISOString(),
})

/**
 * CRUD over the api-key store for the currently signed-in admin. Mounted at
 * `/admin/api/api-keys` and protected by the same session guard as the rest
 * of the admin transport.
 *
 * The controller intentionally rejects requests authenticated via an API
 * key (i.e. when `currentAdmin.apiKey` is present) — keys must never be
 * able to bootstrap or escalate themselves.
 */
@ApiTags('Admin / API Keys')
@ApiCookieAuth('session')
@Controller('admin/api/api-keys')
@UseGuards(ModernAdminAuthGuard)
export class ApiKeysController {
  constructor(
    @Inject(MODERN_ADMIN) private readonly admin: ModernAdmin,
    @Optional() @Inject(MODERN_ADMIN_API_KEY_SERVICE) private readonly service?: IApiKeyService,
    @Optional() @Inject(MODERN_ADMIN_OPTIONS) private readonly options?: ModernAdminModuleOptions,
  ) {}

  @Get()
  async list(@Req() req: AdminRequest): Promise<{ keys: ApiKeyResponse[] }> {
    this.assertSession(req)
    const service = this.requireService()
    const rows = normalizeListResult(await service.list(toHeaders(req.headers)))
    return { keys: rows.map(toResponse) }
  }

  @Post()
  async create(
    @Body() body: unknown,
    @Req() req: AdminRequest,
  ): Promise<{ key: string; record: ApiKeyResponse }> {
    this.assertSession(req)
    const parsed = createBodyZ.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.message)
    this.validatePermissions(parsed.data.permissions)
    const service = this.requireService()
    const created = await service.create(
      {
        name: parsed.data.name,
        expiresIn:
          parsed.data.expiresInDays === undefined
            ? undefined
            : parsed.data.expiresInDays === null
              ? null
              : parsed.data.expiresInDays * DAY_MS,
        permissions: parsed.data.permissions,
      },
      toHeaders(req.headers),
    )
    this.auditLog('apiKey.create', req.currentAdmin!, created.id, created.name ?? undefined)
    return { key: created.key, record: toResponse(created) }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AdminRequest,
  ): Promise<{ record: ApiKeyResponse }> {
    this.assertSession(req)
    const parsed = updateBodyZ.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.message)
    if (parsed.data.permissions) this.validatePermissions(parsed.data.permissions)
    const service = this.requireService()
    try {
      const row = await service.update(
        {
          keyId: id,
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
          ...(parsed.data.permissions !== undefined ? { permissions: parsed.data.permissions } : {}),
          ...(parsed.data.expiresInDays === undefined
            ? {}
            : parsed.data.expiresInDays === null
              ? { expiresIn: null }
              : { expiresIn: parsed.data.expiresInDays * DAY_MS }),
        },
        toHeaders(req.headers),
      )
      this.auditLog('apiKey.update', req.currentAdmin!, row.id, row.name ?? undefined)
      return { record: toResponse(row) }
    } catch (err) {
      throw mapServiceError(err)
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: AdminRequest): Promise<{ success: true }> {
    this.assertSession(req)
    const service = this.requireService()
    try {
      await service.delete(id, toHeaders(req.headers))
      this.auditLog('apiKey.delete', req.currentAdmin!, id)
      return { success: true }
    } catch (err) {
      throw mapServiceError(err)
    }
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private assertSession(req: AdminRequest): void {
    if (!req.currentAdmin) throw new ForbiddenException('Not authenticated')
    if (req.currentAdmin.apiKey) {
      throw new ForbiddenException('API keys cannot manage other API keys')
    }
  }

  private requireService(): IApiKeyService {
    if (!this.service) {
      throw new NotImplementedException(
        'API key management is not enabled on this auth provider',
      )
    }
    return this.service
  }

  private auditLog(
    action: string,
    admin: CurrentAdmin,
    recordId?: string,
    recordTitle?: string,
  ): void {
    const store = this.options?.logStore
    if (!store) return
    void store.record({
      id: uuidv7(),
      resourceId: '__api_keys__',
      action,
      userId: admin.id,
      ...(recordId ? { recordId } : {}),
      ...(recordTitle ? { recordTitle } : {}),
      at: Date.now(),
    })
  }

  /** Reject permissions naming unknown resources or actions. */
  private validatePermissions(permissions: Record<string, string[]>): void {
    for (const [resourceId, actions] of Object.entries(permissions)) {
      if (resourceId === '*') continue
      let resource
      try {
        resource = this.admin.findResource(resourceId)
      } catch {
        throw new BadRequestException(`Unknown resource: ${resourceId}`)
      }
      const decorator = resource.decorate()
      for (const action of actions) {
        if (action === '*') continue
        if (!decorator.getAction(action)) {
          throw new BadRequestException(`Unknown action "${action}" on resource "${resourceId}"`)
        }
      }
    }
  }
}

const mapServiceError = (err: unknown): unknown => {
  const message = err instanceof Error ? err.message : String(err)
  if (/not found|invalid id|key.*not.*exist/i.test(message)) {
    return new NotFoundException(message)
  }
  if (/forbidden|unauthorized|not allowed/i.test(message)) {
    return new ForbiddenException(message)
  }
  if (/invalid|validation/i.test(message)) {
    return new BadRequestException(message)
  }
  return err
}

const normalizeListResult = (result: ApiKeyListResult): ApiKeyRowLike[] => {
  if (Array.isArray(result)) return result
  if ('keys' in result && Array.isArray(result.keys)) return result.keys
  if ('apiKeys' in result && Array.isArray(result.apiKeys)) return result.apiKeys
  throw new TypeError('API key service list() must return an array or an object containing keys')
}
