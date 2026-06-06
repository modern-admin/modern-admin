import {
  uuidv7,
  type IWebhookStore,
  type Webhook,
  type WebhookDelivery,
  type WebhookDeliveryStatus,
  type WebhookInput,
} from '@modern-admin/core'
import { desc, eq } from 'drizzle-orm'
import type { DrizzleLike, SystemTables } from '../types.js'

interface WebhookRow {
  id: string
  name: string
  url: string
  events: unknown
  resourceId: string | null
  enabled: boolean
  secret: string | null
  headers: unknown
  filters: unknown
  payloadFields: unknown
  createdAt: Date
  updatedAt: Date
}

interface DeliveryRow {
  id: string
  webhookId: string
  event: string
  payload: unknown
  status: string
  responseStatus: number | null
  responseBody: string | null
  error: string | null
  attempt: number
  createdAt: Date
  deliveredAt: Date | null
}

const rowToWebhook = (row: WebhookRow): Webhook => ({
  id: row.id,
  name: row.name,
  url: row.url,
  events: Array.isArray(row.events) ? (row.events as string[]) : [],
  resourceId: row.resourceId,
  enabled: row.enabled,
  ...(row.secret !== null ? { secret: row.secret } : {}),
  headers: (row.headers as Record<string, string>) ?? {},
  filters: (row.filters as Record<string, string>) ?? {},
  payloadFields: Array.isArray(row.payloadFields) ? (row.payloadFields as string[]) : [],
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

const rowToDelivery = (row: DeliveryRow): WebhookDelivery => ({
  id: row.id,
  webhookId: row.webhookId,
  event: row.event,
  payload: (row.payload as Record<string, unknown>) ?? {},
  status: row.status as WebhookDeliveryStatus,
  ...(row.responseStatus !== null ? { responseStatus: row.responseStatus } : {}),
  ...(row.responseBody !== null ? { responseBody: row.responseBody } : {}),
  ...(row.error !== null ? { error: row.error } : {}),
  attempt: row.attempt,
  createdAt: row.createdAt.toISOString(),
  ...(row.deliveredAt !== null ? { deliveredAt: row.deliveredAt.toISOString() } : {}),
})

export class DrizzleWebhookStore implements IWebhookStore {
  constructor(
    private readonly db: DrizzleLike,
    private readonly hookTable: SystemTables['maWebhook'],
    private readonly deliveryTable: SystemTables['maWebhookDelivery'],
  ) {}

  async list(): Promise<Webhook[]> {
    const rows = (await this.db
      .select()
      .from(this.hookTable)
      .orderBy(desc(this.hookTable.createdAt))) as WebhookRow[]
    return rows.map(rowToWebhook)
  }

  async get(id: string): Promise<Webhook | null> {
    const rows = (await this.db
      .select()
      .from(this.hookTable)
      .where(eq(this.hookTable.id, id))
      .limit(1)) as WebhookRow[]
    return rows[0] ? rowToWebhook(rows[0]) : null
  }

  async create(input: WebhookInput): Promise<Webhook> {
    const rows = (await this.db
      .insert(this.hookTable)
      .values({
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
      })
      .returning()) as WebhookRow[]
    return rowToWebhook(rows[0]!)
  }

  async update(id: string, patch: Partial<WebhookInput>): Promise<Webhook> {
    const data: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.name !== undefined) data['name'] = patch.name
    if (patch.url !== undefined) data['url'] = patch.url
    if (patch.events !== undefined) data['events'] = patch.events
    if (patch.resourceId !== undefined) data['resourceId'] = patch.resourceId ?? null
    if (patch.enabled !== undefined) data['enabled'] = patch.enabled
    if (patch.secret !== undefined) data['secret'] = patch.secret
    if (patch.headers !== undefined) data['headers'] = patch.headers
    if (patch.filters !== undefined) data['filters'] = patch.filters
    if (patch.payloadFields !== undefined) data['payloadFields'] = patch.payloadFields
    const rows = (await this.db
      .update(this.hookTable)
      .set(data)
      .where(eq(this.hookTable.id, id))
      .returning()) as WebhookRow[]
    if (!rows[0]) throw new Error(`Webhook not found: ${id}`)
    return rowToWebhook(rows[0])
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(this.hookTable).where(eq(this.hookTable.id, id))
  }

  async recordDelivery(
    delivery: Omit<WebhookDelivery, 'id' | 'createdAt'>,
  ): Promise<WebhookDelivery> {
    const rows = (await this.db
      .insert(this.deliveryTable)
      .values({
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
      })
      .returning()) as DeliveryRow[]
    return rowToDelivery(rows[0]!)
  }

  async listDeliveries(webhookId: string, limit = 50): Promise<WebhookDelivery[]> {
    const rows = (await this.db
      .select()
      .from(this.deliveryTable)
      .where(eq(this.deliveryTable.webhookId, webhookId))
      .orderBy(desc(this.deliveryTable.createdAt))
      .limit(limit)) as DeliveryRow[]
    return rows.map(rowToDelivery)
  }
}
