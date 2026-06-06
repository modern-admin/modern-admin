/**
 * Schema extension contract — lets sibling packages contribute extra Query /
 * Mutation fields to the dynamically-built admin schema without taking a
 * direct dependency on the GraphQL transport.
 *
 * Wiring in the host application:
 * ```ts
 * ModernAdminGraphqlModule.forRoot({
 *   extensions: [uploadGraphqlExtension()],
 * })
 * ```
 *
 * Each extension factory receives the shared `ExtensionContext` (the `Upload`
 * scalar and a couple of common types) so contributors do not have to re-build
 * them. Extensions are merged before the per-resource fields are appended.
 */

import type { GraphQLFieldConfig, GraphQLNamedType, GraphQLScalarType } from 'graphql'
import type { GraphqlContext } from './schema-builder.js'

export interface ExtensionContext {
  /** Shared `Upload` scalar — re-use rather than redeclaring per extension. */
  Upload: GraphQLScalarType
}

export interface GraphqlSchemaExtension {
  /** Optional name used purely for diagnostics. */
  name?: string
  /** Extra named types (e.g. object types referenced from the contributed fields). */
  types?: GraphQLNamedType[]
  /** Mutation field map keyed by mutation name. */
  mutations?: Record<string, GraphQLFieldConfig<unknown, GraphqlContext>>
  /** Query field map keyed by query name. */
  queries?: Record<string, GraphQLFieldConfig<unknown, GraphqlContext>>
}

/**
 * Factory signature for extensions that need access to shared scalars/types
 * (e.g. the `Upload` scalar). Extensions can also be expressed as a static
 * object — both forms are accepted.
 */
export type GraphqlExtensionFactory =
  | GraphqlSchemaExtension
  | ((ctx: ExtensionContext) => GraphqlSchemaExtension)
