// Wraps the dynamic GraphQL schema in a Nest module. The module is global by
// default — it depends on the host app having `MODERN_ADMIN` registered via
// `@modern-admin/nest` ModernAdminModule.

import { type DynamicModule, Inject, Module, OnModuleInit } from '@nestjs/common'
import type { GraphQLSchema } from 'graphql'
import { MODERN_ADMIN } from '@modern-admin/nest'
import type { ModernAdmin } from '@modern-admin/core'
import { GraphqlController } from './controller.js'
import { GRAPHQL_SCHEMA } from './tokens.js'
import { buildGraphqlSchema } from './schema-builder.js'

export interface ModernAdminGraphqlOptions {
  global?: boolean
}

@Module({})
export class ModernAdminGraphqlModule implements OnModuleInit {
  constructor(
    @Inject(MODERN_ADMIN) private readonly admin: ModernAdmin,
    @Inject(GRAPHQL_SCHEMA) private readonly schema: GraphQLSchema,
  ) {}

  /**
   * Hook to give adapters a chance to lazily compute extra metadata before
   * schema introspection is exposed. Today it only logs when the schema is
   * empty (no resources), which is otherwise a silent footgun.
   */
  onModuleInit(): void {
    if (this.admin.resources.length === 0) {
      // eslint-disable-next-line no-console
      console.warn('[modern-admin/graphql] no resources registered; schema only exposes _status')
    }
    // Reference the field so TS recognises the read.
    void this.schema
  }

  static forRoot(options: ModernAdminGraphqlOptions = {}): DynamicModule {
    return {
      module: ModernAdminGraphqlModule,
      global: options.global ?? false,
      controllers: [GraphqlController],
      providers: [
        {
          provide: GRAPHQL_SCHEMA,
          useFactory: (admin: ModernAdmin) => buildGraphqlSchema(admin),
          inject: [MODERN_ADMIN],
        },
      ],
      exports: [GRAPHQL_SCHEMA],
    }
  }
}
