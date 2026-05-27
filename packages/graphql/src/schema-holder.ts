// Lazy GraphQL schema holder. The schema is built on first access rather
// than during DI provider instantiation so that resources contributed by
// `ModernAdminModule.forFeature()` (which are attached during
// OnApplicationBootstrap) make it into the schema regardless of module init
// ordering. After the first call the schema is cached for the process
// lifetime.

import { Inject, Injectable } from '@nestjs/common'
import { type GraphQLSchema } from 'graphql'
import { MODERN_ADMIN } from '@modern-admin/nest'
import type { ModernAdmin } from '@modern-admin/core'
import { buildGraphqlSchema } from './schema-builder.js'
import { GRAPHQL_OPTIONS } from './tokens.js'
import type { ResolvedGraphqlOptions } from './module.js'

@Injectable()
export class ModernAdminGraphqlSchemaHolder {
  private cached: GraphQLSchema | null = null

  constructor(
    @Inject(MODERN_ADMIN) private readonly admin: ModernAdmin,
    @Inject(GRAPHQL_OPTIONS) private readonly options: ResolvedGraphqlOptions,
  ) {}

  get(): GraphQLSchema {
    if (!this.cached) {
      this.cached = buildGraphqlSchema(this.admin, { extensions: this.options.extensions })
    }
    return this.cached
  }
}
