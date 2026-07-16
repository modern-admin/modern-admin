import {
  rowToDelivery,
  rowToWebhook,
  uuidv7,
  type DeliveryRow,
  type IWebhookStore,
  type Webhook,
  type WebhookDelivery,
  type WebhookInput,
  type WebhookRow,
} from '@modern-admin/core'
import type { PrismaDelegate } from '../types.js'

export class PrismaWebhookStore implements IWebhookStore {
  constructor(
    private readonly webhookDelegate: PrismaDelegate<WebhookRow>,
    private readonly deliveryDelegate: PrismaDelegate<DeliveryRow>,
  ) {}

  async list(): Promise<Webhook[]> {
    const rows = await this.webhookDelegate.findMany({ orderBy: { createdAt: 'desc' } })
    return rows.map(rowToWebhook)
  }

  async get(id: string): Promise<Webhook | null> {
    const row = await this.webhookDelegate.findUnique({ where: { id } })
    return row ? rowToWebhook(row) : null
  }

  async create(input: WebhookInput): Promise<Webhook> {
    const row = await this.webhookDelegate.create({
      data: {
        id: uuidv7(),
        name: input.name,
        url: input.url,
        events: input.events,
        resourceId: input.resourceId ?? null,
        enabled: input.enabled ?? true,
        secret: input.secret ?? null,
        headers: input.headers ?? {},
        filters: input.filters ?? {},
        payloadFields: input.payloadFields ?? [],
      },
    })
    return rowToWebhook(row)
  }

  async update(id: string, patch: Partial<WebhookInput>): Promise<Webhook> {
    const data: Record<string, unknown> = {}
    if (patch.name !== undefined) data['name'] = patch.name
    if (patch.url !== undefined) data['url'] = patch.url
    if (patch.events !== undefined) data['events'] = patch.events
    if (patch.resourceId !== undefined) data['resourceId'] = patch.resourceId ?? null
    if (patch.enabled !== undefined) data['enabled'] = patch.enabled
    if (patch.secret !== undefined) data['secret'] = patch.secret
    if (patch.headers !== undefined) data['headers'] = patch.headers
    if (patch.filters !== undefined) data['filters'] = patch.filters
    if (patch.payloadFields !== undefined) data['payloadFields'] = patch.payloadFields
    const row = await this.webhookDelegate.update({ where: { id }, data })
    return rowToWebhook(row)
  }

  async delete(id: string): Promise<void> {
    await this.webhookDelegate.delete({ where: { id } })
  }

  async recordDelivery(
    delivery: Omit<WebhookDelivery, 'id' | 'createdAt'>,
  ): Promise<WebhookDelivery> {
    const row = await this.deliveryDelegate.create({
      data: {
        id: uuidv7(),
        webhookId: delivery.webhookId,
        event: delivery.event,
        payload: delivery.payload,
        status: delivery.status,
        responseStatus: delivery.responseStatus ?? null,
        responseBody: delivery.responseBody ?? null,
        error: delivery.error ?? null,
        attempt: delivery.attempt,
        deliveredAt: delivery.deliveredAt ? new Date(delivery.deliveredAt) : null,
      },
    })
    return rowToDelivery(row)
  }

  async listDeliveries(webhookId: string, limit = 50): Promise<WebhookDelivery[]> {
    const rows = await this.deliveryDelegate.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    return rows.map(rowToDelivery)
  }
}
