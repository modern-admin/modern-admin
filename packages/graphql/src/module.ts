// Wraps the dynamic GraphQL schema in a Nest module. The module is global by
// default — it depends on the host app having `MODERN_ADMIN` registered via
// `@modern-admin/nest` ModernAdminModule.

import { type DynamicModule, Inject, Module, type OnApplicationBootstrap } from '@nestjs/common'
import { MODERN_ADMIN } from '@modern-admin/nest'
import type { ModernAdmin } from '@modern-admin/core'
import { GraphqlController } from './controller.js'
import { GRAPHQL_OPTIONS, GRAPHQL_SCHEMA } from './tokens.js'
import { ModernAdminGraphqlSchemaHolder } from './schema-holder.js'
import type { GraphqlExtensionFactory } from './extensions.js'

export interface ModernAdminGraphqlOptions {
  global?: boolean
  /**
   * Serve an embedded Apollo Sandbox on `GET /admin/graphql/sandbox` (UI is
   * loaded from Apollo's CDN). Defaults to `true` — pass `false` to disable
   * (e.g. in production deploys with strict CSP).
   */
  sandbox?: boolean
  /**
   * Extra Query/Mutation fields contributed by sibling packages — e.g.
   * `uploadGraphqlExtension()` from `@modern-admin/feature-upload`.
   */
  extensions?: ReadonlyArray<GraphqlExtensionFactory>
}

@Module({})
export class ModernAdminGraphqlModule implements OnApplicationBootstrap {
  constructor(@Inject(MODERN_ADMIN) private readonly admin: ModernAdmin) {}

  /**
   * Runs after every module's onModuleInit, including the nest package's
   * bootstrap service that drains forFeature() resources. By the time we
   * report on the resource count, all feature modules have contributed.
   */
  onApplicationBootstrap(): void {
    if (this.admin.resources.length === 0) {
      // eslint-disable-next-line no-console
      console.warn('[modern-admin/graphql] no resources registered; schema only exposes _status')
    }
  }

  static forRoot(options: ModernAdminGraphqlOptions = {}): DynamicModule {
    const resolved: ResolvedGraphqlOptions = {
      sandbox: options.sandbox ?? true,
      extensions: options.extensions ?? [],
    }
    return {
      module: ModernAdminGraphqlModule,
      global: options.global ?? false,
      controllers: [GraphqlController],
      providers: [
        ModernAdminGraphqlSchemaHolder,
        { provide: GRAPHQL_SCHEMA, useExisting: ModernAdminGraphqlSchemaHolder },
        { provide: GRAPHQL_OPTIONS, useValue: resolved },
      ],
      exports: [GRAPHQL_SCHEMA, GRAPHQL_OPTIONS, ModernAdminGraphqlSchemaHolder],
    }
  }
}

/** Internal — narrow shape of options after defaults have been applied. */
export interface ResolvedGraphqlOptions {
  sandbox: boolean
  extensions: ReadonlyArray<GraphqlExtensionFactory>
}
