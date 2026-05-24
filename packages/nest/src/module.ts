import {
  DynamicModule,
  Module,
  Type,
  type Provider,
} from '@nestjs/common'
import { APP_INTERCEPTOR, DiscoveryModule } from '@nestjs/core'
import { QueueModule } from '@modern-admin/queue'
import {
  ModernAdmin,
  type IAiTaskStore,
  type IConfigStore,
  type IHistoryStore,
  type IQueryableLogStore,
  type IWebhookStore,
  type ModernAdminOptions,
} from '@modern-admin/core'
import { MODERN_ADMIN, MODERN_ADMIN_API_KEY_SERVICE, MODERN_ADMIN_OPTIONS } from './tokens.js'
import type { IApiKeyService } from './api-keys.controller.js'
import { AiAssistantController } from './ai-assistant.controller.js'
import { AiAssistantService } from './ai-assistant.service.js'
import { AiAssistantProcessor } from './ai-assistant.processor.js'
import { AI_ASSISTANT_QUEUE } from './ai-assistant.constants.js'
import { ResourceController } from './resource.controller.js'
import { ConfigController } from './config.controller.js'
import { AuthController } from './auth.controller.js'
import { ApiKeysController } from './api-keys.controller.js'
import { AnalyticsController } from './analytics.controller.js'
import { HistoryController } from './history.controller.js'
import { AuditLogController } from './audit-log.controller.js'
import { GlobalSearchController } from './global-search.controller.js'
import { WebhooksController } from './webhooks.controller.js'
import { DashboardController } from './dashboard.controller.js'
import { ModernAdminAuthGuard } from './auth.guard.js'
import { ModernAdminCacheInterceptor } from './cache.interceptor.js'
import {
  AdminControllerScanner,
  ModernAdminBootstrapService,
} from './admin'
import type { AdminController } from './admin'

export interface ModernAdminModuleOptions extends ModernAdminOptions {
  /** When true, registers the auth guard globally for the admin routes. */
  global?: boolean
  /** Store backing global/user/resource settings. Required for AI assistant settings persistence. */
  configStore?: IConfigStore
  /** Store backing long-running AI task metadata and event streaming. */
  aiTaskStore?: IAiTaskStore
  /** AI assistant configuration for the built-in chat widget + endpoints. */
  aiAssistant?: {
    enabled?: boolean
    defaultModel?: string
    /** Seed API key from environment. Stored value from configStore takes precedence once set via UI. */
    apiKey?: string
    systemPrompt?: string
    includeResourceIds?: string[]
    excludeResourceIds?: string[]
    /** Enable verbose server-side logs for AI assistant jobs/tools. */
    debug?: boolean
    maxRecordsPerTool?: number
    maxSteps?: number
    chatRoles?: string[]
    manageRoles?: string[]
    appName?: string
    appUrl?: string
    /**
     * Optional raw SQL query executor. When provided, the AI assistant gains
     * an `execute_sql` tool that runs read-only SELECT queries against the
     * host database, enabling aggregation, grouping, and JOIN operations that
     * the per-resource list/show/search tools cannot express.
     *
     * SECURITY REQUIREMENT: the implementation MUST enforce read-only access
     * at the database level — not just in application code. Acceptable options:
     *
     *   1. PostgreSQL — wrap in a READ ONLY transaction (recommended):
     *        rawQuery: (sql) => prisma.$transaction(async (tx) => {
     *          await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
     *          return tx.$queryRawUnsafe(sql)
     *        })
     *
     *   2. Dedicated read-only DB user with GRANT SELECT only:
     *        rawQuery: (sql) => readOnlyPrisma.$queryRawUnsafe(sql)
     *      where `readOnlyPrisma` connects as a Postgres role without write
     *      privileges.
     *
     *   3. MySQL — read-only transaction:
     *        rawQuery: (sql) => pool.execute('START TRANSACTION READ ONLY')
     *          .then(() => pool.execute(sql).then(([rows]) => rows))
     *          .finally(() => pool.execute('ROLLBACK'))
     *
     * The tool also rejects any query not starting with SELECT before calling
     * this function, but that check is advisory — database-level enforcement
     * is mandatory and must be provided by the caller.
     */
    rawQuery?: (sql: string) => Promise<unknown[]>
    queue?: {
      attempts?: number
      backoffMs?: number
      removeOnComplete?: boolean | number
      removeOnFail?: boolean | number
    }
  }
  /**
   * Implementation that powers `/admin/api/api-keys/*` (Settings → API
   * Keys). When omitted, the endpoints respond with 501. Hosts using
   * `BetterAuthProvider` can adapt `provider.getApiKeyAdmin()` into this
   * shape.
   */
  apiKeyService?: IApiKeyService
  /**
   * Roles allowed to see the raw SQL string captured by adapters in the
   * `/timeseries` response. Defaults to `['admin']`. Other roles get the
   * series only. Set to `[]` to disable SQL exposure entirely.
   */
  timeseriesSqlRoles?: string[]
  /** Store powering record revision history endpoints. */
  historyStore?: IHistoryStore
  /** Queryable store powering the audit-log endpoint. */
  logStore?: IQueryableLogStore
  /** Store powering Settings → Webhooks and webhook delivery metadata. */
  webhookStore?: IWebhookStore
  /** Optional queue dispatcher used by the Webhooks test endpoint. */
  webhookDispatcher?: {
    enqueue(job: {
      webhookId: string
      event: string
      payload: unknown
    }): void | Promise<void>
  }
  /** Roles allowed to inspect and revert record history. Defaults to `['admin']`. */
  historyRoles?: string[]
  /** Roles allowed to inspect the audit log. Defaults to `['admin']`. */
  auditLogRoles?: string[]
  /** Roles allowed to manage outgoing webhooks. Defaults to `['admin']`. */
  webhookRoles?: string[]
  /**
   * When set, the bootstrap service calls `auth.seedAdmin(rootAdmin)` on every
   * app start. The implementation must be idempotent — it skips creation when
   * the user already exists. Requires `BetterAuthProvider` (or any `IAuthProvider`
   * that implements the optional `seedAdmin` method).
   */
  rootAdmin?: { email: string; password: string; name?: string; role?: string }
}

@Module({})
export class ModernAdminFeatureModule {}

/**
 * Derive the SPA capability flags from the optional subsystems the host
 * has wired into `ModernAdminModuleOptions`. The frontend reads these via
 * `/admin/api/config` and uses them to hide UI surfaces (audit-log link,
 * settings sections, per-record revisions button, AI assistant widget)
 * that would otherwise trigger 501/403 requests.
 *
 * Any explicit `features` entry on `options` overrides the derived value,
 * so deployments can hide a section that is technically configured.
 */
const deriveFeatures = (
  options: ModernAdminModuleOptions,
): ModernAdminModuleOptions['features'] => ({
  auditLog: typeof options.logStore?.list === 'function',
  history: options.historyStore !== undefined,
  webhooks: options.webhookStore !== undefined,
  apiKeys: options.apiKeyService !== undefined,
  aiAssistant: options.aiAssistant !== undefined,
  ...(options.features ?? {}),
})

/**
 * NestJS dynamic module wrapping a single ModernAdmin instance.
 *
 * Resources are declared as classes that extend `AdminController` and are
 * decorated with `@AdminResource`. The bootstrap step
 * (`AdminControllerScanner` + `ModernAdminBootstrapService`) walks the
 * Nest DI container, picks up every class tagged with `@AdminResource`,
 * synthesises `ResourceWithOptions` from the metadata, and registers it
 * on the ModernAdmin instance.
 *
 * Two equivalent registration styles are supported:
 *
 * 1. **Natural Nest shape (recommended).** Call `forRoot({ global: true })`
 *    once, then declare each resource in a regular feature module via
 *    standard `controllers` / `providers` arrays:
 *
 *    ```ts
 *    @Module({
 *      controllers: [CommentsAdminController],
 *      providers: [AuditLogService],
 *    })
 *    export class CommentsAdminModule {}
 *    ```
 *
 *    Supporting services live in the same module as the controller, so
 *    DI resolves them naturally without further plumbing.
 *
 * 2. **Explicit `forFeature(...)`.** A thin helper that wraps the above
 *    in a synthetic feature module. Use it when you prefer to keep the
 *    registration colocated with the import.
 */
@Module({})
export class ModernAdminModule {
  static forRoot(options: ModernAdminModuleOptions): DynamicModule {
    const aiEnabled = options.aiAssistant !== undefined
    const admin = new ModernAdmin({ ...options, features: deriveFeatures(options) })
    const apiKeyProviders: Provider[] = options.apiKeyService
      ? [{ provide: MODERN_ADMIN_API_KEY_SERVICE, useValue: options.apiKeyService }]
      : []
    return {
      module: ModernAdminModule,
      global: options.global ?? false,
      imports: [
        DiscoveryModule,
        ...(aiEnabled ? [QueueModule.register({ queues: [AI_ASSISTANT_QUEUE] })] : []),
      ],
      controllers: [
        ResourceController,
        ConfigController,
        AuthController,
        ApiKeysController,
        ...(aiEnabled ? [AiAssistantController] : []),
        AnalyticsController,
        HistoryController,
        AuditLogController,
        GlobalSearchController,
        WebhooksController,
        DashboardController,
      ],
      providers: [
        { provide: MODERN_ADMIN_OPTIONS, useValue: options },
        { provide: MODERN_ADMIN, useValue: admin },
        ...apiKeyProviders,
        ...(aiEnabled ? [AiAssistantService, AiAssistantProcessor] : []),
        AdminControllerScanner,
        ModernAdminBootstrapService,
        ModernAdminAuthGuard,
        ModernAdminCacheInterceptor,
        // Apply the cache interceptor to every route. It's GET-only and
        // resource-scoped — non-admin paths and unknown resources bypass.
        { provide: APP_INTERCEPTOR, useExisting: ModernAdminCacheInterceptor },
      ],
      exports: [
        MODERN_ADMIN,
        MODERN_ADMIN_OPTIONS,
        AdminControllerScanner,
        ModernAdminAuthGuard,
        ModernAdminCacheInterceptor,
      ],
    }
  }

  /**
   * Register one or more `AdminController` subclasses as admin resources.
   * Each class becomes a Nest provider so that `@Injectable` services
   * passed via `options.providers` (or imported via `options.imports`)
   * can be injected through the controller's constructor. The bootstrap
   * service later picks the controllers up via the Nest discovery API
   * and attaches them to the running ModernAdmin instance.
   *
   * Because controllers are constructed inside the synthetic feature
   * module returned here, supporting services must be declared in the
   * **same** scope — either inlined as `providers` on the forFeature
   * call or pulled in via `imports`. Declaring them on the outer
   * wrapper module is not enough; that module is one scope away from
   * the controllers and will trigger `UnknownDependenciesException`.
   *
   * ```ts
   * @Module({
   *   imports: [
   *     ModernAdminModule.forFeature([UsersAdminController], {
   *       providers: [MailerService],
   *     }),
   *   ],
   * })
   * export class UsersAdminModule {}
   * ```
   */
  static forFeature(
    controllers: Type<AdminController>[],
    options?: {
      imports?: DynamicModule['imports']
      providers?: Provider[]
    },
  ): DynamicModule {
    const controllerProviders: Provider[] = controllers.map((c) => ({
      provide: c,
      useClass: c,
    }))
    const extra = options?.providers ?? []
    return {
      module: ModernAdminFeatureModule,
      ...(options?.imports ? { imports: options.imports } : {}),
      providers: [...controllerProviders, ...extra],
      exports: controllerProviders,
    }
  }

  /**
   * Async variant: build the underlying ModernAdmin instance from a factory.
   */
  static forRootAsync(opts: {
    imports?: DynamicModule['imports']
    inject?: unknown[]
    useFactory: (...args: unknown[]) => ModernAdminModuleOptions | Promise<ModernAdminModuleOptions>
    global?: boolean
  }): DynamicModule {
    return {
      module: ModernAdminModule,
      global: opts.global ?? false,
      imports: [DiscoveryModule, QueueModule.register({ queues: [AI_ASSISTANT_QUEUE] }), ...(opts.imports ?? [])],
      controllers: [
        ResourceController,
        ConfigController,
        AuthController,
        ApiKeysController,
        AiAssistantController,
        AnalyticsController,
        HistoryController,
        AuditLogController,
        GlobalSearchController,
        WebhooksController,
        DashboardController,
      ],
      providers: [
        {
          provide: MODERN_ADMIN_OPTIONS,
          useFactory: opts.useFactory,
          inject: opts.inject as never[],
        },
        {
          provide: MODERN_ADMIN,
          useFactory: (resolved: ModernAdminModuleOptions) =>
            new ModernAdmin({ ...resolved, features: deriveFeatures(resolved) }),
          inject: [MODERN_ADMIN_OPTIONS],
        },
        AiAssistantService,
        AiAssistantProcessor,
        AdminControllerScanner,
        ModernAdminBootstrapService,
        ModernAdminAuthGuard,
        ModernAdminCacheInterceptor,
        { provide: APP_INTERCEPTOR, useExisting: ModernAdminCacheInterceptor },
      ],
      exports: [
        MODERN_ADMIN,
        MODERN_ADMIN_OPTIONS,
        AdminControllerScanner,
        ModernAdminAuthGuard,
        ModernAdminCacheInterceptor,
      ],
    }
  }
}
