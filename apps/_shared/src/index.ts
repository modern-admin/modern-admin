// `@modern-admin/app-shared` — infrastructure shared by the reference
// host app `apps/api-prisma` (Prisma + Postgres). Built as a separate
// workspace package so an external host (your own Nest service) can
// reuse the same controllers + Better Auth wiring without depending on
// the demo's `prisma` schema.
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
  setAuditLogStore,
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
