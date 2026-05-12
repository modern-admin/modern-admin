import { createHmac } from 'node:crypto'
import type { IWebhookStore, Webhook } from '@modern-admin/core'
import type { WebhookDeliveryOptions, WebhookJob } from './types.js'

export const WEBHOOK_RESPONSE_BODY_LIMIT = 1000
export const WEBHOOK_TIMEOUT_MS = 10_000

export function signPayload(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

export async function deliverWebhookJob(
  store: IWebhookStore,
  job: WebhookJob,
  attempt: number,
  options: WebhookDeliveryOptions = {},
): Promise<void> {
  const webhook = await store.get(job.webhookId)
  if (!webhook || !webhook.enabled) return
  const body = JSON.stringify(job.payload)
  const headers = buildHeaders(webhook, job, body)
  const timeoutMs = options.timeoutMs ?? WEBHOOK_TIMEOUT_MS
  const responseBodyLimit = options.responseBodyLimit ?? WEBHOOK_RESPONSE_BODY_LIMIT
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    })
    const text = await response.text().catch(() => '')
    const responseBody = text.slice(0, responseBodyLimit)
    if (!response.ok) {
      await store.recordDelivery({
        webhookId: webhook.id,
        event: job.event,
        payload: job.payload as unknown as Record<string, unknown>,
        status: 'failed',
        responseStatus: response.status,
        responseBody,
        error: response.statusText || `HTTP ${response.status}`,
        attempt,
      })
      throw new Error(`Webhook ${webhook.id} failed with HTTP ${response.status}`)
    }
    await store.recordDelivery({
      webhookId: webhook.id,
      event: job.event,
      payload: job.payload as unknown as Record<string, unknown>,
      status: 'success',
      responseStatus: response.status,
      responseBody,
      attempt,
      deliveredAt: new Date().toISOString(),
    })
  } catch (err) {
    if (err instanceof Error && err.message.startsWith(`Webhook ${webhook.id} failed`)) {
      throw err
    }
    await store.recordDelivery({
      webhookId: webhook.id,
      event: job.event,
      payload: job.payload as unknown as Record<string, unknown>,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      attempt,
    })
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

function buildHeaders(webhook: Webhook, job: WebhookJob, body: string): Record<string, string> {
  return {
    ...webhook.headers,
    'Content-Type': 'application/json',
    'X-Modern-Admin-Event': job.event,
    'X-Modern-Admin-Delivery': job.payload.id,
    ...(webhook.secret ? { 'X-Modern-Admin-Signature': signPayload(webhook.secret, body) } : {}),
  }
}
