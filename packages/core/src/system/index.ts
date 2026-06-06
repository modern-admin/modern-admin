// System subsystems — ports + Zod schemas + in-memory implementations
// for action logs, webhooks, config, history, AI tasks, and SQL cache.
//
// External adapters (`@modern-admin/system-prisma`,
// `@modern-admin/system-drizzle`) implement these ports against the
// host application's ORM client.

export * from './schemas.js'
export * from './ports.js'
export {
  ConsoleLogStore,
  MemoryLogStore,
  MemoryWebhookStore,
  MemoryConfigStore,
  MemoryHistoryStore,
  MemoryAiTaskStore,
  MemoryCacheStore,
  createMemorySystem,
} from './memory.js'
