import { uuidv7 } from '@modern-admin/core'
import type { Webhook } from '@modern-admin/core'
import type { WebhookEventPayload } from './types.js'

export function eventMatches(patterns: readonly string[], event: string): boolean {
  const [, action] = event.split('.')
  const generic = action ? `record.${action}` : event
  for (const pattern of patterns) {
    if (pattern === '*' || pattern === event || pattern === generic) return true
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -1)
      if (event.startsWith(prefix) || generic.startsWith(prefix)) return true
    }
  }
  return false
}

export function filtersMatch(
  filters: Record<string, string> | undefined,
  record: Record<string, unknown>,
): boolean {
  if (!filters || Object.keys(filters).length === 0) return true
  for (const [path, expected] of Object.entries(filters)) {
    if (expected === '') continue
    const actual = record[path]
    if (String(actual ?? '') !== expected) return false
  }
  return true
}

export function projectRecord(
  record: Record<string, unknown>,
  fields: readonly string[] | undefined,
): Record<string, unknown> {
  if (!fields?.length) return { ...record }
  const out: Record<string, unknown> = {}
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(record, field)) out[field] = record[field]
  }
  return out
}

export function webhookMatches(
  webhook: Webhook,
  args: { event: string; resourceId: string; record: Record<string, unknown> },
): boolean {
  if (!webhook.enabled) return false
  if (webhook.resourceId && webhook.resourceId !== args.resourceId) return false
  if (!eventMatches(webhook.events, args.event)) return false
  return filtersMatch(webhook.filters, args.record)
}

export function defaultPayload(args: {
  event: string
  resourceId: string
  recordId: string
  record: Record<string, unknown>
  previousRecord?: Record<string, unknown>
  actorId?: string
}): WebhookEventPayload {
  const occurredAt = new Date().toISOString()
  return {
    id: `${args.event}:${args.recordId}:${occurredAt}:${uuidv7()}`,
    event: args.event,
    resourceId: args.resourceId,
    recordId: args.recordId,
    occurredAt,
    record: args.record,
    ...(args.previousRecord ? { previousRecord: args.previousRecord } : {}),
    ...(args.actorId ? { actorId: args.actorId } : {}),
  }
}
