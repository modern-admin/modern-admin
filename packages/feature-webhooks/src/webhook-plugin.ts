import type {
  ActionRequest,
  ActionResponse,
  CurrentAdmin,
  GlobalPlugin,
  ResourceOptions,
} from '@modern-admin/core'
import { NoopWebhookDispatcher } from './noop-dispatcher.js'
import { defaultPayload, projectRecord, webhookMatches } from './matcher.js'
import type { WebhookEventAction, WebhookPluginOptions } from './types.js'

type AfterHook = (
  response: ActionResponse,
  request: ActionRequest,
  context: unknown,
) => ActionResponse | Promise<ActionResponse>

interface HookContext {
  resource: { decorate(): { id: string } }
  record?: { id?: string; params?: Record<string, unknown> }
  currentAdmin?: CurrentAdmin
}

const DEFAULT_ACTIONS = ['new', 'edit', 'delete'] as const

const actionToEvent = (action: string): WebhookEventAction | null => {
  if (action === 'new') return 'created'
  if (action === 'edit') return 'updated'
  if (action === 'delete') return 'deleted'
  return null
}

const responseRecord = (response: ActionResponse): {
  id?: string
  params?: Record<string, unknown>
} | undefined => (response as { record?: { id?: string; params?: Record<string, unknown> } }).record

const toArray = (hook: unknown): AfterHook[] => {
  if (!hook) return []
  return Array.isArray(hook) ? (hook as AfterHook[]) : [hook as AfterHook]
}

const mergeAfterHook = (
  existing: Record<string, unknown> | undefined,
  newHook: AfterHook,
): AfterHook[] => [...toArray(existing?.after), newHook]

const defaultUserIdResolver = (admin: CurrentAdmin | undefined): string | undefined => {
  const id = admin?.id
  return id === undefined || id === null ? undefined : String(id)
}

function buildAfterHook(
  actionName: typeof DEFAULT_ACTIONS[number],
  options: WebhookPluginOptions,
): AfterHook {
  const dispatcher = options.dispatcher ?? new NoopWebhookDispatcher()
  const userIdResolver = options.userIdResolver ?? defaultUserIdResolver
  return async (response, _request, context) => {
    const eventAction = actionToEvent(actionName)
    if (!eventAction) return response
    const ctx = context as HookContext
    const resourceId = ctx.resource.decorate().id
    const event = `${resourceId}.${eventAction}`
    const record = actionName === 'delete'
      ? ctx.record
      : responseRecord(response)
    const recordId = record?.id
    const recordParams = record?.params
    if (!recordId || !recordParams) return response
    const previousParams = ctx.record?.params
    const actorId = userIdResolver(ctx.currentAdmin)

    try {
      const webhooks = await options.store.list()
      for (const webhook of webhooks) {
        if (!webhookMatches(webhook, { event, resourceId, record: recordParams })) continue
        const projected = projectRecord(recordParams, webhook.payloadFields)
        const previousProjected = previousParams
          ? projectRecord(previousParams, webhook.payloadFields)
          : undefined
        const payload = options.payloadBuilder
          ? options.payloadBuilder({
              webhook,
              event,
              resourceId,
              recordId: String(recordId),
              record: projected,
              ...(previousProjected ? { previousRecord: previousProjected } : {}),
              ...(actorId ? { actorId } : {}),
            })
          : defaultPayload({
              event,
              resourceId,
              recordId: String(recordId),
              record: projected,
              ...(previousProjected ? { previousRecord: previousProjected } : {}),
              ...(actorId ? { actorId } : {}),
            })
        await dispatcher.enqueue({ webhookId: webhook.id, event, payload })
      }
    } catch {
      // Webhook dispatch must never break the original admin mutation.
    }
    return response
  }
}

export function webhookPlugin(options: WebhookPluginOptions): GlobalPlugin {
  return {
    name: 'webhooks',
    ...(options.include ? { include: options.include } : {}),
    ...(options.exclude ? { exclude: options.exclude } : {}),
    apply: (resourceOptions: ResourceOptions): ResourceOptions => {
      const existingActions = resourceOptions.actions as
        | Record<string, Record<string, unknown>>
        | undefined
      const overrides: Record<string, Record<string, unknown>> = {}
      for (const actionName of DEFAULT_ACTIONS) {
        const existing = existingActions?.[actionName]
        overrides[actionName] = {
          ...existing,
          after: mergeAfterHook(existing, buildAfterHook(actionName, options)),
        }
      }
      return {
        ...resourceOptions,
        actions: {
          ...(resourceOptions.actions ?? {}),
          ...overrides,
        } as ResourceOptions['actions'],
      }
    },
  }
}
