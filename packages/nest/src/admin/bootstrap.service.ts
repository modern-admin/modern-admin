// Drains class-based admin controllers (declared via
// ModernAdminModule.forFeature([...])) into the running ModernAdmin
// instance. Runs in OnApplicationBootstrap so every feature module has
// had its providers constructed by Nest DI before we scan for them.
//
// After registering the synthesised resources, the bootstrap step wires
// each controller with the corresponding `BaseResource` and shared
// `ModernAdmin` instance so user method bodies can rely on `this.admin`
// / `this.resource` from the very first invocation.

import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common'
import type { BaseResource, ModernAdmin } from '@modern-admin/core'
import { collectTelemetryInfo, reportTelemetry } from '@modern-admin/telemetry'
import { MODERN_ADMIN, MODERN_ADMIN_OPTIONS } from '../tokens.js'
import type { ModernAdminModuleOptions } from '../module.js'
import { AdminControllerScanner } from './scanner.js'

@Injectable()
export class ModernAdminBootstrapService implements OnApplicationBootstrap {
  constructor(
    @Inject(MODERN_ADMIN) private readonly admin: ModernAdmin,
    @Inject(MODERN_ADMIN_OPTIONS) private readonly options: ModernAdminModuleOptions,
    private readonly scanner: AdminControllerScanner,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
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
}
