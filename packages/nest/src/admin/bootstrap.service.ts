// Drains class-based admin controllers (declared via
// ModernAdminModule.forFeature([...])) into the running ModernAdmin
// instance. Runs in OnApplicationBootstrap so every feature module has
// had its providers constructed by Nest DI before we scan for them.
//
// After registering the synthesised resources, the bootstrap step wires
// each controller with the corresponding `BaseResource` and shared
// `ModernAdmin` instance so user method bodies can rely on `this.admin`
// / `this.resource` from the very first invocation.

import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import type { BaseResource, ModernAdmin } from '@modern-admin/core'
import { collectTelemetryInfo, reportTelemetry } from '@modern-admin/telemetry'
import { MODERN_ADMIN, MODERN_ADMIN_OPTIONS } from '../tokens.js'
import type { ModernAdminModuleOptions } from '../module.js'
import { AdminControllerScanner } from './scanner.js'

@Injectable()
export class ModernAdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger('ModernAdmin')

  constructor(
    @Inject(MODERN_ADMIN) private readonly admin: ModernAdmin,
    @Inject(MODERN_ADMIN_OPTIONS) private readonly options: ModernAdminModuleOptions,
    private readonly scanner: AdminControllerScanner,
    private readonly adapterHost: HttpAdapterHost,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.ensureExpressQueryParserExtended()

    // Seed the root admin when configured. Runs before resource registration
    // so the admin panel is accessible immediately on first boot.
    if (this.options.rootAdmin && typeof this.admin.auth.seedAdmin === 'function') {
      await this.admin.auth.seedAdmin(this.options.rootAdmin)
    }

    const pairs = this.scanner.scan()
    if (pairs.length === 0) return
    const before = this.admin.resources.length
    this.admin.registerResources({
      resources: pairs.map((p) => p.rwo),
      ...(this.options.adapters ? { adapters: this.options.adapters } : {}),
    })
    // Built resources are appended in scan order. Match each controller to
    // the BaseResource the factory just produced so user code can rely on
    // `this.admin` / `this.resource` immediately.
    const added = this.admin.resources.slice(before)
    if (added.length !== pairs.length) {
      // Duplicate id between scan results is the only path that produces
      // a mismatch — surface it loudly so the user fixes the conflict.
      const ids = pairs.map((p) => p.rwo.options?.id ?? '<auto>')
      throw new Error(
        `[modern-admin/nest] resource registration mismatch (${pairs.length} controllers vs ${added.length} resources). Likely duplicate ids: ${ids.join(', ')}`,
      )
    }
    pairs.forEach(({ controller }, i) => {
      controller.admin = this.admin
      controller.resource = added[i] as BaseResource
    })

    // Opt-in telemetry ping — fires only when MODERN_ADMIN_TELEMETRY=1.
    // Fire-and-forget: never awaited in the hot path, silently swallows
    // any network error.
    void reportTelemetry(collectTelemetryInfo(this.admin))
  }

  /**
   * Force the Express `query parser` setting to `'extended'` so that
   * bracket-notation filter params (`filters[role]=admin`) are parsed by
   * `qs` into nested objects (`{ filters: { role: 'admin' } }`) before
   * `ResourceController.list` runs. The list/show/related-records UI on
   * the frontend depends on that shape, and `Filter` in core would
   * otherwise see `undefined` and silently return all records.
   *
   * Express 5 (Nest 11 + @nestjs/platform-express ≥ 11) ships with
   * `'simple'` as the default — querystring's native parser keeps
   * `filters[role]` as a flat key with brackets in the name, which
   * doesn't match the Zod DTO and disables filtering completely.
   *
   * Skips silently on non-Express adapters (Fastify exposes no `set`/
   * `get` Express-style API). Skips if the host already installed a
   * custom function parser — that's an explicit opt-out which we respect.
   */
  private ensureExpressQueryParserExtended(): void {
    const httpAdapter = this.adapterHost.httpAdapter
    if (!httpAdapter) return
    const instance = httpAdapter.getInstance?.() as
      | { set?: (key: string, value: unknown) => void; get?: (key: string) => unknown }
      | undefined
    if (!instance || typeof instance.set !== 'function' || typeof instance.get !== 'function') {
      return
    }
    const current = instance.get('query parser')
    if (typeof current === 'function') return
    if (current === 'extended') return
    instance.set('query parser', 'extended')
    this.logger.log(
      "Forced Express 'query parser' to 'extended' so filters[...] bracket params parse into nested objects. Set it explicitly in your bootstrap to silence this.",
    )
  }
}
