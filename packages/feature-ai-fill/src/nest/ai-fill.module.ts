/**
 * ModernAdminAiFillModule — registers `AiFillController` + `AiFillService`.
 *
 * Import alongside `ModernAdminModule.forRoot()` in the host application:
 *
 * ```ts
 * @Module({
 *   imports: [
 *     ModernAdminModule.forRoot({ global: true, configStore, … }),
 *     ModernAdminAiFillModule.forRoot(),
 *     // resource modules that call aiFillFeature() …
 *   ],
 * })
 * export class AdminModule {}
 * ```
 *
 * Throttling is enabled by default (5 requests / 60 s per user). Override
 * via the `throttle` option:
 *
 * ```ts
 * ModernAdminAiFillModule.forRoot({ throttle: { ttl: 30_000, limit: 3 } })
 * ModernAdminAiFillModule.forRoot({ throttle: false }) // disable (e.g. tests)
 * ```
 *
 * The module depends on `MODERN_ADMIN`, `MODERN_ADMIN_OPTIONS`, and
 * `ModernAdminAuthGuard` being globally available from
 * `ModernAdminModule.forRoot({ global: true })`.
 */

import { type DynamicModule, Module } from '@nestjs/common'
import { ThrottlerModule } from '@nestjs/throttler'
import { AiFillController, AiFillThrottlerGuard } from './ai-fill.controller.js'
import { AiFillService } from './ai-fill.service.js'
import {
  AI_FILL_MODULE_OPTIONS,
  type ModernAdminAiFillModuleOptions,
} from './ai-fill.tokens.js'

export type { ModernAdminAiFillModuleOptions } from './ai-fill.tokens.js'

const THROTTLE_DEFAULT_TTL = 60_000
const THROTTLE_DEFAULT_LIMIT = 5

@Module({})
export class ModernAdminAiFillModule {
  static forRoot(options: ModernAdminAiFillModuleOptions = {}): DynamicModule {
    const throttleOpts = options.throttle === false ? null : (options.throttle ?? {})

    return {
      module: ModernAdminAiFillModule,
      global: options.global ?? false,
      imports: [
        ThrottlerModule.forRoot([
          {
            name: 'ai-fill',
            ttl: throttleOpts?.ttl ?? THROTTLE_DEFAULT_TTL,
            limit: throttleOpts?.limit ?? THROTTLE_DEFAULT_LIMIT,
          },
        ]),
      ],
      controllers: [AiFillController],
      providers: [
        { provide: AI_FILL_MODULE_OPTIONS, useValue: options },
        AiFillService,
        AiFillThrottlerGuard,
      ],
      exports: [AI_FILL_MODULE_OPTIONS],
    }
  }
}
