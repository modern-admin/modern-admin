import type { CurrentAdmin, IWebhookStore, Webhook } from '@modern-admin/core'

export type WebhookEventAction = 'created' | 'updated' | 'deleted'

export interface WebhookEventPayload {
  id: string
  event: string
  resourceId: string
  recordId: string
  actorId?: string
  occurredAt: string
  record: Record<string, unknown>
  previousRecord?: Record<string, unknown>
}

export interface WebhookJob {
  webhookId: string
  event: string
  payload: WebhookEventPayload
}

export interface IWebhookDispatcher {
  enqueue(job: WebhookJob): void | Promise<void>
}

export interface WebhookPluginOptions {
  store: IWebhookStore
  dispatcher?: IWebhookDispatcher
  include?: string[]
  exclude?: string[]
  userIdResolver?: (admin: CurrentAdmin | undefined) => string | undefined
  payloadBuilder?: (args: {
    webhook: Webhook
    event: string
    resourceId: string
    recordId: string
    record: Record<string, unknown>
    previousRecord?: Record<string, unknown>
    actorId?: string
  }) => WebhookEventPayload
}

export interface WebhookDeliveryOptions {
  timeoutMs?: number
  responseBodyLimit?: number
}
