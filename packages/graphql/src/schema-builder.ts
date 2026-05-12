// Builds a GraphQL schema dynamically from a ModernAdmin instance. Resources
// are not known at compile time, so we use the `graphql` library directly
// (rather than @nestjs/graphql code-first which expects classes) and emit one
// Type / FilterInput / Query / Mutation set per resource.

import {
  GraphQLBoolean,
  GraphQLFloat,
  GraphQLID,
  GraphQLInputObjectType,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLSchema,
  GraphQLString,
  Kind,
  type GraphQLFieldConfig,
  type GraphQLFieldResolver,
  type GraphQLInputFieldConfig,
} from 'graphql'
import DataLoader from 'dataloader'
import {
  Filter,
  type BaseProperty,
  type BaseResource,
  type CurrentAdmin,
  type ModernAdmin,
  type PropertyType,
  type RawFilters,
} from '@modern-admin/core'
import { GraphQLUpload } from './scalars.js'
import type { ExtensionContext, GraphqlExtensionFactory, GraphqlSchemaExtension } from './extensions.js'

export interface GraphqlContext {
  admin: ModernAdmin
  currentAdmin?: CurrentAdmin
  loaders: Map<string, DataLoader<string, unknown>>
}

const GraphQLJSON = new GraphQLScalarType({
  name: 'JSON',
  description: 'Arbitrary JSON value',
  serialize: (v) => v,
  parseValue: (v) => v,
  parseLiteral(ast): unknown {
    switch (ast.kind) {
      case Kind.STRING:
      case Kind.BOOLEAN:
        return ast.value
      case Kind.INT:
      case Kind.FLOAT:
        return Number(ast.value)
      case Kind.NULL:
        return null
      case Kind.LIST:
        return ast.values.map((v) => GraphQLJSON.parseLiteral(v, undefined))
      case Kind.OBJECT: {
        const obj: Record<string, unknown> = {}
        for (const field of ast.fields) {
          obj[field.name.value] = GraphQLJSON.parseLiteral(field.value, undefined)
        }
        return obj
      }
      default:
        return null
    }
  },
})

const GraphQLDateTime = new GraphQLScalarType({
  name: 'DateTime',
  description: 'ISO-8601 date-time string',
  serialize: (v) => (v instanceof Date ? v.toISOString() : v),
  parseValue: (v) => (typeof v === 'string' ? new Date(v) : v),
  parseLiteral: (ast) => (ast.kind === Kind.STRING ? new Date(ast.value) : null),
})

const scalarFor = (type: PropertyType) => {
  switch (type) {
    case 'number':
      return GraphQLInt
    case 'float':
    case 'currency':
      return GraphQLFloat
    case 'boolean':
      return GraphQLBoolean
    case 'date':
    case 'datetime':
      return GraphQLDateTime
    case 'json':
    case 'mixed':
    case 'key-value':
      return GraphQLJSON
    case 'reference':
      return GraphQLID
    default:
      return GraphQLString
  }
}

const idCapitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** PascalCase a resource id so type names are valid GraphQL identifiers. */
const toTypeName = (id: string): string =>
  id
    .replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (c) => c.toUpperCase()) || 'Resource'

const buildPropertyFields = (
  properties: BaseProperty[],
): Record<string, GraphQLFieldConfig<unknown, GraphqlContext>> => {
  const fields: Record<string, GraphQLFieldConfig<unknown, GraphqlContext>> = {}
  for (const p of properties) {
    if (p.subProperties().length > 0) continue
    const isId = p.isId()
    // M2M virtual property: surfaced as `[JSON!]` — each entry carries the
    // referenced record's id plus any junction extra fields. Keeping it as
    // JSON sidesteps generating per-junction object types while still
    // exposing the data verbatim to clients.
    if (p.type() === 'm2m') {
      fields[p.path()] = {
        type: new GraphQLList(new GraphQLNonNull(GraphQLJSON)),
        resolve: (src) => {
          const v = (src as Record<string, unknown> | undefined)?.[p.path()]
          return Array.isArray(v) ? v : []
        },
      }
      continue
    }
    const baseType = isId ? GraphQLID : scalarFor(p.type())
    const resolved = p.isRequired() && !isId ? new GraphQLNonNull(baseType) : baseType
    fields[p.path()] = {
      type: isId ? new GraphQLNonNull(resolved) : resolved,
      resolve: (src) => (src as Record<string, unknown> | undefined)?.[p.path()] ?? null,
    }
  }
  return fields
}

const buildFilterInputFields = (
  properties: BaseProperty[],
): Record<string, GraphQLInputFieldConfig> => {
  const fields: Record<string, GraphQLInputFieldConfig> = {}
  for (const p of properties) {
    if (p.subProperties().length > 0) continue
    fields[p.path()] = { type: GraphQLString }
  }
  return fields
}

const buildCreateInputFields = (
  properties: BaseProperty[],
): Record<string, GraphQLInputFieldConfig> => {
  const fields: Record<string, GraphQLInputFieldConfig> = {}
  for (const p of properties) {
    if (p.isId() || p.subProperties().length > 0) continue
    if (p.type() === 'm2m') {
      // Accept an array of `{ id, ...extras }` items (or bare ids).
      fields[p.path()] = { type: new GraphQLList(GraphQLJSON) }
      continue
    }
    const base = scalarFor(p.type())
    fields[p.path()] = { type: p.isRequired() ? new GraphQLNonNull(base) : base }
  }
  return fields
}

const buildUpdateInputFields = (
  properties: BaseProperty[],
): Record<string, GraphQLInputFieldConfig> => {
  const fields: Record<string, GraphQLInputFieldConfig> = {}
  for (const p of properties) {
    if (p.isId() || p.subProperties().length > 0) continue
    if (p.type() === 'm2m') {
      fields[p.path()] = { type: new GraphQLList(GraphQLJSON) }
      continue
    }
    fields[p.path()] = { type: scalarFor(p.type()) }
  }
  return fields
}

const loaderFor = (
  ctx: GraphqlContext,
  resource: BaseResource,
): DataLoader<string, unknown> => {
  const id = resource.decorate().id
  let loader = ctx.loaders.get(id)
  if (!loader) {
    loader = new DataLoader<string, unknown>(async (ids) => {
      const records = await resource.findMany([...ids])
      const byId = new Map(records.map((r) => [String(r.id()), r.params]))
      return ids.map((i) => byId.get(String(i)) ?? null)
    })
    ctx.loaders.set(id, loader)
  }
  return loader
}

const attachReferenceResolvers = (
  type: GraphQLObjectType,
  resource: BaseResource,
  admin: ModernAdmin,
): void => {
  const fields = type.getFields()
  for (const property of resource.properties()) {
    const refId = property.reference()
    if (!refId) continue
    // M2M virtual properties carry `reference` for routing the editor, but
    // the value isn't a scalar FK — skip the auto-resolver.
    if (property.type() === 'm2m') continue
    const targetResource = admin.resources.find((r) => r.decorate().id === refId)
    if (!targetResource) continue
    // Augment the existing scalar field with a sibling-loaded reference.
    const refFieldName = `${property.path()}Ref`
    const targetType = (admin as unknown as { _gqlTypes?: Map<string, GraphQLObjectType> })
      ._gqlTypes?.get(refId)
    if (!targetType) continue
    const resolve: GraphQLFieldResolver<unknown, GraphqlContext> = async (src, _args, ctx) => {
      const fk = (src as Record<string, unknown>)[property.path()]
      if (fk == null) return null
      return loaderFor(ctx, targetResource).load(String(fk))
    }
    fields[refFieldName] = {
      name: refFieldName,
      description: `Resolved ${property.path()} reference to ${refId}`,
      type: targetType,
      args: [],
      resolve,
      deprecationReason: undefined,
      extensions: {},
      astNode: undefined,
    } as unknown as (typeof fields)[string]
  }
}

const filterFromInput = (
  input: Record<string, unknown> | undefined,
  resource: BaseResource,
): Filter => {
  const raw: RawFilters = {}
  if (input) {
    for (const [k, v] of Object.entries(input)) {
      if (v != null) raw[k] = String(v)
    }
  }
  return new Filter(raw, resource)
}

export interface BuildGraphqlSchemaOptions {
  /** Extra Query/Mutation fields (and named types) contributed by sibling
   * packages — see `GraphqlSchemaExtension`. Each entry may be a static
   * object or a factory that takes the shared `Upload` scalar. */
  extensions?: ReadonlyArray<GraphqlExtensionFactory>
}

export const buildGraphqlSchema = (
  admin: ModernAdmin,
  options: BuildGraphqlSchemaOptions = {},
): GraphQLSchema => {
  const objectTypes = new Map<string, GraphQLObjectType>()
  const filterInputs = new Map<string, GraphQLInputObjectType>()
  const createInputs = new Map<string, GraphQLInputObjectType>()
  const updateInputs = new Map<string, GraphQLInputObjectType>()

  // First pass: object types so reference resolvers can target them.
  for (const resource of admin.resources) {
    const id = resource.decorate().id
    const typeName = toTypeName(id)
    objectTypes.set(
      id,
      new GraphQLObjectType<unknown, GraphqlContext>({
        name: typeName,
        fields: () => buildPropertyFields(resource.properties()),
      }),
    )
    filterInputs.set(
      id,
      new GraphQLInputObjectType({
        name: `${typeName}FilterInput`,
        fields: () => buildFilterInputFields(resource.properties()),
      }),
    )
    createInputs.set(
      id,
      new GraphQLInputObjectType({
        name: `${typeName}CreateInput`,
        fields: () => buildCreateInputFields(resource.properties()),
      }),
    )
    updateInputs.set(
      id,
      new GraphQLInputObjectType({
        name: `${typeName}UpdateInput`,
        fields: () => buildUpdateInputFields(resource.properties()),
      }),
    )
  }

  // Stash on admin so reference resolvers can find sibling types by id.
  ;(admin as unknown as { _gqlTypes?: Map<string, GraphQLObjectType> })._gqlTypes = objectTypes

  // Second pass: attach reference resolvers using the now-built object types.
  for (const resource of admin.resources) {
    const id = resource.decorate().id
    const type = objectTypes.get(id)
    if (type) attachReferenceResolvers(type, resource, admin)
  }

  const queryFields: Record<string, GraphQLFieldConfig<unknown, GraphqlContext>> = {}
  const mutationFields: Record<string, GraphQLFieldConfig<unknown, GraphqlContext>> = {}

  for (const resource of admin.resources) {
    const id = resource.decorate().id
    const lower = id.charAt(0).toLowerCase() + id.slice(1)
    const objType = objectTypes.get(id)!
    const filterInput = filterInputs.get(id)!
    const createInput = createInputs.get(id)!
    const updateInput = updateInputs.get(id)!

    queryFields[`${lower}List`] = {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(objType))),
      args: {
        filter: { type: filterInput },
        limit: { type: GraphQLInt },
        offset: { type: GraphQLInt },
        sortBy: { type: GraphQLString },
        sortDirection: { type: GraphQLString },
      },
      async resolve(_src, args, ctx) {
        const response = await ctx.admin.invoke(
          {
            params: { resourceId: id, action: 'list' },
            method: 'get',
            query: {
              page: args.offset != null && args.limit
                ? String(Math.floor(Number(args.offset) / Number(args.limit)) + 1)
                : '1',
              perPage: args.limit != null ? String(args.limit) : undefined,
              sortBy: args.sortBy ?? undefined,
              direction: args.sortDirection ?? undefined,
              filters: (args.filter as Record<string, unknown> | undefined) ?? {},
            },
          },
          ctx.currentAdmin,
        )
        const records = (response as { records?: Array<{ params: unknown }> }).records ?? []
        return records.map((r) => r.params)
      },
    }

    queryFields[`${lower}One`] = {
      type: objType,
      args: { id: { type: new GraphQLNonNull(GraphQLID) } },
      async resolve(_src, args, ctx) {
        const record = await ctx.admin.findResource(id).findOne(String(args.id))
        return record?.params ?? null
      },
    }

    queryFields[`${lower}Count`] = {
      type: new GraphQLNonNull(GraphQLInt),
      args: { filter: { type: filterInput } },
      async resolve(_src, args, ctx) {
        const r = ctx.admin.findResource(id)
        return r.count(filterFromInput(args.filter, r))
      },
    }

    mutationFields[`create${idCapitalize(lower)}`] = {
      type: new GraphQLNonNull(objType),
      args: { input: { type: new GraphQLNonNull(createInput) } },
      async resolve(_src, args, ctx) {
        const response = await ctx.admin.invoke(
          {
            params: { resourceId: id, action: 'new' },
            method: 'post',
            payload: args.input as Record<string, unknown>,
          },
          ctx.currentAdmin,
        )
        return (response as { record: { params: unknown } }).record.params
      },
    }

    mutationFields[`update${idCapitalize(lower)}`] = {
      type: new GraphQLNonNull(objType),
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        input: { type: new GraphQLNonNull(updateInput) },
      },
      async resolve(_src, args, ctx) {
        const response = await ctx.admin.invoke(
          {
            params: { resourceId: id, recordId: String(args.id), action: 'edit' },
            method: 'patch',
            payload: args.input as Record<string, unknown>,
          },
          ctx.currentAdmin,
        )
        return (response as { record: { params: unknown } }).record.params
      },
    }

    mutationFields[`delete${idCapitalize(lower)}`] = {
      type: new GraphQLNonNull(GraphQLBoolean),
      args: { id: { type: new GraphQLNonNull(GraphQLID) } },
      async resolve(_src, args, ctx) {
        await ctx.admin.invoke(
          {
            params: { resourceId: id, recordId: String(args.id), action: 'delete' },
            method: 'delete',
          },
          ctx.currentAdmin,
        )
        return true
      },
    }
  }

  // Always include a status field so the schema is non-empty even when no
  // resources are registered (helps with smoke tests / introspection).
  queryFields._status = {
    type: new GraphQLNonNull(GraphQLString),
    resolve: () => 'ok',
  }

  // Merge schema extensions (e.g. file upload mutations contributed by
  // `@modern-admin/feature-upload`). Extension factories receive the shared
  // `Upload` scalar so they don't have to redeclare it.
  const extensionContext: ExtensionContext = { Upload: GraphQLUpload }
  const extraTypes: GraphQLObjectType[] = []
  for (const factory of options.extensions ?? []) {
    const ext: GraphqlSchemaExtension =
      typeof factory === 'function' ? factory(extensionContext) : factory
    if (ext.queries) {
      for (const [name, cfg] of Object.entries(ext.queries)) {
        if (queryFields[name]) {
          throw new Error(
            `Schema extension "${ext.name ?? '(anonymous)'}" tried to redefine Query.${name}`,
          )
        }
        queryFields[name] = cfg
      }
    }
    if (ext.mutations) {
      for (const [name, cfg] of Object.entries(ext.mutations)) {
        if (mutationFields[name]) {
          throw new Error(
            `Schema extension "${ext.name ?? '(anonymous)'}" tried to redefine Mutation.${name}`,
          )
        }
        mutationFields[name] = cfg
      }
    }
    if (ext.types) {
      for (const t of ext.types) {
        // Only object types can appear in the extra-types list (input/scalar
        // types are referenced through field configs, which auto-collect them).
        if (t instanceof GraphQLObjectType) extraTypes.push(t)
      }
    }
  }

  return new GraphQLSchema({
    query: new GraphQLObjectType({ name: 'Query', fields: () => queryFields }),
    mutation:
      Object.keys(mutationFields).length > 0
        ? new GraphQLObjectType({ name: 'Mutation', fields: () => mutationFields })
        : undefined,
    types: extraTypes.length > 0 ? extraTypes : undefined,
  })
}

export const createContext = (
  admin: ModernAdmin,
  currentAdmin?: CurrentAdmin,
): GraphqlContext => ({
  admin,
  ...(currentAdmin ? { currentAdmin } : {}),
  loaders: new Map(),
})
