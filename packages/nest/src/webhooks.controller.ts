import {
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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger'
import {
  webhookZ,
  type CurrentAdmin,
  type Webhook,
  type WebhookDelivery,
  type WebhookInput,
} from '@modern-admin/core'
import { z } from 'zod'
import { ModernAdminAuthGuard } from './auth.guard.js'
import type { ModernAdminModuleOptions } from './module.js'
import { MODERN_ADMIN_OPTIONS } from './tokens.js'

interface AdminRequest {
  currentAdmin?: CurrentAdmin
}

const inputZ = webhookZ.omit({ id: true, createdAt: true, updatedAt: true })
const patchZ = inputZ.partial()
const deliveriesQueryZ = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

export interface WebhooksListResponse {
  webhooks: Webhook[]
}

export interface WebhookResponse {
  webhook: Webhook
}

export interface WebhookDeliveriesResponse {
  deliveries: WebhookDelivery[]
}

@ApiTags('Admin / Webhooks')
@ApiCookieAuth('session')
@Controller('admin/api/webhooks')
@UseGuards(ModernAdminAuthGuard)
export class WebhooksController {
  constructor(
    @Optional()
    @Inject(MODERN_ADMIN_OPTIONS)
    private readonly options?: ModernAdminModuleOptions,
  ) {}

  @Get()
  async list(@Req() req: AdminRequest): Promise<WebhooksListResponse> {
    this.assertAllowed(req.currentAdmin)
    return { webhooks: await this.requireStore().list() }
  }

  @Post()
  async create(
    @Body() body: unknown,
    @Req() req: AdminRequest,
  ): Promise<WebhookResponse> {
    this.assertAllowed(req.currentAdmin)
    const input = inputZ.parse(body) as WebhookInput
    return { webhook: await this.requireStore().create(input) }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AdminRequest,
  ): Promise<WebhookResponse> {
    this.assertAllowed(req.currentAdmin)
    const patch = patchZ.parse(body) as Partial<WebhookInput>
    const store = this.requireStore()
    if (!(await store.get(id))) throw new NotFoundException('Webhook not found')
    return { webhook: await store.update(id, patch) }
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @Req() req: AdminRequest,
  ): Promise<{ success: true }> {
    this.assertAllowed(req.currentAdmin)
    const store = this.requireStore()
    if (!(await store.get(id))) throw new NotFoundException('Webhook not found')
    await store.delete(id)
    return { success: true }
  }

  @Get(':id/deliveries')
  async deliveries(
    @Param('id') id: string,
    @Query() rawQuery: Record<string, unknown>,
    @Req() req: AdminRequest,
  ): Promise<WebhookDeliveriesResponse> {
    this.assertAllowed(req.currentAdmin)
    const store = this.requireStore()
    if (!(await store.get(id))) throw new NotFoundException('Webhook not found')
    const query = deliveriesQueryZ.parse(rawQuery)
    return { deliveries: await store.listDeliveries(id, query.limit ?? 50) }
  }

  @Post(':id/test')
  async test(
    @Param('id') id: string,
    @Req() req: AdminRequest,
  ): Promise<{ success: true }> {
    this.assertAllowed(req.currentAdmin)
    const store = this.requireStore()
    const webhook = await store.get(id)
    if (!webhook) throw new NotFoundException('Webhook not found')
    const payload = {
      id: `webhook.test:${webhook.id}:${new Date().toISOString()}`,
      event: 'webhook.test',
      webhookId: webhook.id,
    }
    if (this.options?.webhookDispatcher) {
      await this.options.webhookDispatcher.enqueue({
        webhookId: webhook.id,
        event: 'webhook.test',
        payload,
      })
    } else {
      await store.recordDelivery({
        webhookId: webhook.id,
        event: 'webhook.test',
        payload,
        status: 'pending',
        attempt: 1,
      })
    }
    return { success: true }
  }

  private requireStore(): NonNullable<ModernAdminModuleOptions['webhookStore']> {
    const store = this.options?.webhookStore
    if (!store) throw new NotImplementedException('Webhook store is not configured')
    return store
  }

  private assertAllowed(admin: CurrentAdmin | undefined): void {
    const role = admin?.role
    if (role === undefined) return
    const allowed = this.options?.webhookRoles ?? ['admin']
    if (!allowed.includes(String(role))) throw new ForbiddenException('Webhooks are not available')
  }
}
