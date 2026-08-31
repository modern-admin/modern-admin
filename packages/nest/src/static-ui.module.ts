/**
 * NestJS module that wires the prebuilt admin SPA into the host app via a
 * single middleware. Mount it in your root module:
 *
 * ```ts
 * @Module({
 *   imports: [
 *     ModernAdminModule.forRoot({...}),
 *     ModernAdminStaticUiModule.forRoot({
 *       path: '/admin',
 *       runtimeConfig: { apiUrl: '', credentials: 'include' },
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * Pass the frontend's config type to get autocomplete and typo safety on
 * `runtimeConfig`:
 *
 * ```ts
 * import type { ModernAdminRuntimeConfig } from '@modern-admin/web'
 * ModernAdminStaticUiModule.forRoot<ModernAdminRuntimeConfig>({ … })
 * ```
 *
 * Use `forRootAsync` when the config has to come from `ConfigService` or
 * any other injectable.
 *
 * The module configures middleware on `${path}*` while excluding
 * `${path}/api/*`, so the admin REST/GraphQL routes registered by
 * `ModernAdminModule` keep working as usual.
 */

import {
  Inject,
  type DynamicModule,
  type MiddlewareConsumer,
  Module,
  type ModuleMetadata,
  type NestModule,
  Optional,
  type Provider,
  RequestMethod,
  type Type,
} from '@nestjs/common'
import {
  assertMountPath,
  MODERN_ADMIN_STATIC_UI_OPTIONS,
  ModernAdminStaticUiMiddleware,
  type ModernAdminStaticUiOptions,
  type ModernAdminUiRuntimeConfig,
} from './static-ui.middleware.js'

/** Factory contract for `forRootAsync`, mirroring `ModernAdminModule`. */
export interface ModernAdminStaticUiAsyncOptions<TConfig = ModernAdminUiRuntimeConfig> extends Pick<
  ModuleMetadata,
  'imports'
> {
  useFactory: (
    ...args: never[]
  ) => ModernAdminStaticUiOptions<TConfig> | Promise<ModernAdminStaticUiOptions<TConfig>>
  inject?: Array<Type<unknown> | string | symbol>
}

@Module({})
export class ModernAdminStaticUiModule implements NestModule {
  // Options come through DI rather than a mutable static field: a static
  // would leak between test modules and cannot represent async options.
  constructor(
    @Optional()
    @Inject(MODERN_ADMIN_STATIC_UI_OPTIONS)
    private readonly options: ModernAdminStaticUiOptions = {},
  ) {}

  static forRoot<TConfig = ModernAdminUiRuntimeConfig>(
    options: ModernAdminStaticUiOptions<TConfig> = {},
  ): DynamicModule {
    // Fail at boot rather than on the first request that gets an HTML
    // shell where it expected JSON.
    assertMountPath(options.path ?? '/admin')
    return ModernAdminStaticUiModule.build({
      provide: MODERN_ADMIN_STATIC_UI_OPTIONS,
      useValue: options,
    })
  }

  static forRootAsync<TConfig = ModernAdminUiRuntimeConfig>(
    options: ModernAdminStaticUiAsyncOptions<TConfig>,
  ): DynamicModule {
    return ModernAdminStaticUiModule.build(
      {
        provide: MODERN_ADMIN_STATIC_UI_OPTIONS,
        useFactory: async (...args: never[]) => {
          const resolved = await options.useFactory(...args)
          assertMountPath(resolved.path ?? '/admin')
          return resolved
        },
        inject: options.inject ?? [],
      },
      options.imports,
    )
  }

  private static build(
    optionsProvider: Provider,
    imports: ModuleMetadata['imports'] = [],
  ): DynamicModule {
    return {
      module: ModernAdminStaticUiModule,
      imports,
      providers: [optionsProvider, ModernAdminStaticUiMiddleware],
      exports: [MODERN_ADMIN_STATIC_UI_OPTIONS, ModernAdminStaticUiMiddleware],
    }
  }

  configure(consumer: MiddlewareConsumer): void {
    const path = assertMountPath(this.options.path ?? '/admin')
    // Match the mount and everything under it, but leave the admin API
    // (`${path}/api/*`) alone — those routes are owned by
    // ModernAdminModule's controllers.
    consumer
      .apply(ModernAdminStaticUiMiddleware)
      .exclude({ path: `${path}/api/(.*)`, method: RequestMethod.ALL })
      .forRoutes(
        { path, method: RequestMethod.GET },
        { path: `${path}/(.*)`, method: RequestMethod.GET },
      )
  }
}
