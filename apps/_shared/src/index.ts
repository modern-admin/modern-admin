// `@modern-admin/app-shared` — infrastructure shared between the
// reference apps `apps/api` (InMemory) and `apps/api-prisma` (Prisma).
//
// Covers:
//   • Better Auth factory (api-key + email/password + social providers)
//   • Demo admin seeder
//   • BetterAuthProvider / IApiKeyService builders
//   • AI assistant config defaults
//   • Nest bootstrap pipeline
//   • Shared admin controllers (users, posts, categories, tags, comments,
//     products, regional, favorites + post/product junctions) wired
//     adapter-portably through the source-registry.
//
// Each host app registers its raw sources via `registerAdminSource(...)`
// before NestJS bootstrap, then imports the per-resource feature modules.

export {
  buildBetterAuth,
  type BuildBetterAuthOptions,
  type BuiltBetterAuth,
} from './auth/build-better-auth.js'
export { migrateAuth } from './auth/migrate.js'
export { seedDemoUser, type SeedDemoUserOptions } from './auth/seed-demo-user.js'

export {
  buildBetterAuthProvider,
  buildApiKeyService,
} from './admin/build-auth-provider.js'
export {
  buildAiAssistantConfig,
  type BuildAiAssistantConfigOptions,
  type AiAssistantConfigBase,
} from './admin/ai-assistant-config.js'

export { bootstrapApp, type BootstrapAppOptions } from './nest/bootstrap.js'

// ─── Shared admin layer ────────────────────────────────────────────────
export * from './admin/index.js'
