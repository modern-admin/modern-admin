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
 * The module configures middleware on `${path}*` while excluding
 * `${path}/api/*`, so the admin REST/GraphQL routes registered by
 * `ModernAdminModule` keep working as usual.
 */

import {
  DynamicModule,
  MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common'
import {
  MODERN_ADMIN_STATIC_UI_OPTIONS,
  ModernAdminStaticUiMiddleware,
  type ModernAdminStaticUiOptions,
} from './static-ui.middleware.js'

@Module({})
export class ModernAdminStaticUiModule implements NestModule {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private static options: ModernAdminStaticUiOptions = {}

  static forRoot(options: ModernAdminStaticUiOptions = {}): DynamicModule {
    ModernAdminStaticUiModule.options = options
    return {
      module: ModernAdminStaticUiModule,
      providers: [
        { provide: MODERN_ADMIN_STATIC_UI_OPTIONS, useValue: options },
        ModernAdminStaticUiMiddleware,
      ],
      exports: [MODERN_ADMIN_STATIC_UI_OPTIONS, ModernAdminStaticUiMiddleware],
    }
  }

  configure(consumer: MiddlewareConsumer): void {
    const path = stripTrailingSlash(
      ModernAdminStaticUiModule.options.path ?? '/admin',
    )
    // Match the mount and everything under it, but leave the admin API
    // (`${path}/api/*`) alone — those routes are owned by
    // ModernAdminModule's controllers.
    consumer
      .apply(ModernAdminStaticUiMiddleware)
      .exclude({ path: `${path}/api/(.*)`, method: RequestMethod.ALL })
      .forRoutes(
        { path: path || '/', method: RequestMethod.GET },
        { path: `${path}/(.*)`, method: RequestMethod.GET },
      )
  }
}

function stripTrailingSlash(path: string): string {
  if (path === '/' || path === '') return ''
  return path.endsWith('/') ? path.slice(0, -1) : path
}
