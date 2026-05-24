// @modern-admin/system-prisma — Prisma-backed implementations of the
// runtime system stores defined in `@modern-admin/core/system`.
//
// Quick start:
// 1. Copy `prisma/modern-admin.prisma` into your application's schema
//    (or include via Prisma multi-file schema).
// 2. Run your usual Prisma migration workflow.
// 3. Wire stores to subsystems:
//
//    import { PrismaClient } from '@prisma/client'
//    import { setupPrismaSystem } from '@modern-admin/system-prisma'
//    import { actionLoggingPlugin } from '@modern-admin-pro/feature-logging'
//
//    const prisma = new PrismaClient()
//    const system = setupPrismaSystem(prisma)
//
//    new ModernAdmin({
//      databases: [...],
//      plugins: [actionLoggingPlugin({ store: system.logStore })],
//    })
//
// If you renamed the shipped models, pass `{ models: { log: 'myLog', ... } }`.

import type { ISystemStores } from '@modern-admin/core'
import { PrismaLogStore } from './stores/log-store.js'
import { PrismaWebhookStore } from './stores/webhook-store.js'
import { PrismaConfigStore } from './stores/config-store.js'
import { PrismaHistoryStore } from './stores/history-store.js'
import { PrismaAiTaskStore } from './stores/ai-task-store.js'
import { PrismaCacheStore } from './stores/cache-store.js'
import {
  resolveDelegate,
  type ModelOverrides,
  type PrismaLike,
} from './types.js'

export interface PrismaSystemOptions {
  /**
   * Override Prisma client property names if you renamed the shipped
   * models. Defaults match the camelCased model identifiers from
   * `prisma/modern-admin.prisma`:
   *
   *   { log: 'maLog', webhook: 'maWebhook', webhookDelivery: 'maWebhookDelivery',
   *     config: 'maConfig', history: 'maHistory', aiTask: 'maAiTask',
   *     aiTaskEvent: 'maAiTaskEvent', cache: 'maCache' }
   */
  models?: ModelOverrides
}

export interface PrismaSystem extends ISystemStores {
  logStore: PrismaLogStore
  webhookStore: PrismaWebhookStore
  configStore: PrismaConfigStore
  historyStore: PrismaHistoryStore
  aiTaskStore: PrismaAiTaskStore
  cacheStore: PrismaCacheStore
}

/**
 * Build the full bundle of system stores from a Prisma client instance.
 * The host owns the client lifecycle (connect/disconnect); this just wires
 * the model delegates to thin store classes.
 */
export function setupPrismaSystem(
  prisma: PrismaLike,
  options: PrismaSystemOptions = {},
): PrismaSystem {
  const m = options.models
  return {
    logStore: new PrismaLogStore(resolveDelegate(prisma, 'log', m)),
    webhookStore: new PrismaWebhookStore(
      resolveDelegate(prisma, 'webhook', m),
      resolveDelegate(prisma, 'webhookDelivery', m),
    ),
    configStore: new PrismaConfigStore(resolveDelegate(prisma, 'config', m)),
    historyStore: new PrismaHistoryStore(resolveDelegate(prisma, 'history', m)),
    aiTaskStore: new PrismaAiTaskStore(
      resolveDelegate(prisma, 'aiTask', m),
      resolveDelegate(prisma, 'aiTaskEvent', m),
    ),
    cacheStore: new PrismaCacheStore(resolveDelegate(prisma, 'cache', m)),
  }
}

export { PrismaLogStore } from './stores/log-store.js'
export { PrismaWebhookStore } from './stores/webhook-store.js'
export { PrismaConfigStore } from './stores/config-store.js'
export { PrismaHistoryStore } from './stores/history-store.js'
export { PrismaAiTaskStore } from './stores/ai-task-store.js'
export { PrismaCacheStore } from './stores/cache-store.js'
export type { PrismaDelegate, PrismaLike, ModelOverrides, ModelKey } from './types.js'
export { DEFAULT_MODELS } from './types.js'
