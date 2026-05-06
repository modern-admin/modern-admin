import { DynamicModule, Module } from '@nestjs/common'
import { ModernAdmin, type ModernAdminOptions } from '@modern-admin/core'
import { MODERN_ADMIN, MODERN_ADMIN_OPTIONS } from './tokens.js'
import { ResourceController } from './resource.controller.js'
import { ConfigController } from './config.controller.js'
import { ModernAdminAuthGuard } from './auth.guard.js'
import { ModernAdminCacheInterceptor } from './cache.interceptor.js'

export interface ModernAdminModuleOptions extends ModernAdminOptions {
  /** When true, registers the auth guard globally for the admin routes. */
  global?: boolean
}

/**
 * NestJS dynamic module wrapping a single ModernAdmin instance. The
 * controllers serve `/admin/api/*` and rely on the auth provider configured
 * via `ModernAdminOptions.auth` for access control.
 */
@Module({})
export class ModernAdminModule {
  static forRoot(options: ModernAdminModuleOptions): DynamicModule {
    const admin = new ModernAdmin(options)
    return {
      module: ModernAdminModule,
      global: options.global ?? false,
      controllers: [ResourceController, ConfigController],
      providers: [
        { provide: MODERN_ADMIN_OPTIONS, useValue: options },
        { provide: MODERN_ADMIN, useValue: admin },
        ModernAdminAuthGuard,
        ModernAdminCacheInterceptor,
      ],
      exports: [MODERN_ADMIN, ModernAdminAuthGuard, ModernAdminCacheInterceptor],
    }
  }

  /**
   * Async variant: build the underlying ModernAdmin instance from a factory.
   * Useful when adapters/auth/cache come from other Nest providers.
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
      imports: opts.imports,
      controllers: [ResourceController, ConfigController],
      providers: [
        {
          provide: MODERN_ADMIN_OPTIONS,
          useFactory: opts.useFactory,
          inject: opts.inject as never[],
        },
        {
          provide: MODERN_ADMIN,
          useFactory: (resolved: ModernAdminModuleOptions) => new ModernAdmin(resolved),
          inject: [MODERN_ADMIN_OPTIONS],
        },
        ModernAdminAuthGuard,
        ModernAdminCacheInterceptor,
      ],
      exports: [MODERN_ADMIN, ModernAdminAuthGuard, ModernAdminCacheInterceptor],
    }
  }
}
