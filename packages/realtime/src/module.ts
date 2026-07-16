import { type DynamicModule, Module } from '@nestjs/common'
import { InMemoryRealtimeBus, type IRealtimeBus } from '@modern-admin/core'
import { RealtimeGateway, configureRealtimeOrigins } from './gateway.js'
import { REALTIME_BUS } from './tokens.js'

export interface ModernAdminRealtimeModuleOptions {
  /** Custom bus implementation (e.g. RedisRealtimeBus). Defaults to in-memory. */
  bus?: IRealtimeBus
  /** Make the module global so other features can reuse the bus token. */
  global?: boolean
  /**
   * Browser origins allowed to open the realtime WebSocket. Replaces the old
   * reflect-any-origin CORS (a cross-site WebSocket hijacking vector).
   * Same-origin deploys (SPA served by the same Nest app) need nothing here;
   * cross-origin frontends must list their origin, e.g.
   * `['https://admin.example.com']`. Falls back to the
   * `MODERN_ADMIN_REALTIME_ORIGINS` env var (comma-separated). With neither
   * set, cross-origin browser handshakes are rejected (fail closed).
   */
  origins?: string[]
}

/**
 * NestJS dynamic module wrapping the realtime bus and the WebSocket gateway.
 *
 * Pair with `ModernAdminModule.forRoot({ realtime: <same bus> })` so the
 * core invoke pipeline publishes onto the same bus the gateway listens to.
 */
@Module({})
export class ModernAdminRealtimeModule {
  static forRoot(options: ModernAdminRealtimeModuleOptions = {}): DynamicModule {
    const bus = options.bus ?? new InMemoryRealtimeBus()
    configureRealtimeOrigins(options.origins)
    return {
      module: ModernAdminRealtimeModule,
      global: options.global ?? false,
      providers: [
        { provide: REALTIME_BUS, useValue: bus },
        RealtimeGateway,
      ],
      exports: [REALTIME_BUS, RealtimeGateway],
    }
  }
}
