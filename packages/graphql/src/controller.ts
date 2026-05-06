// HTTP entrypoint for the dynamic admin schema. Single POST endpoint that
// executes a query/mutation against the prebuilt schema, plus a GET fallback
// that ships an introspection-friendly hint.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
} from '@nestjs/common'
import {
  type DocumentNode,
  GraphQLError,
  parse,
  validate,
  execute,
  type ExecutionResult,
  type GraphQLSchema,
} from 'graphql'
import { MODERN_ADMIN } from '@modern-admin/nest'
import type { ModernAdmin } from '@modern-admin/core'
import { GRAPHQL_SCHEMA } from './tokens.js'
import { createContext } from './schema-builder.js'

interface AdminRequest {
  currentAdmin?: { id: string; [key: string]: unknown }
  [key: string]: unknown
}

interface GraphqlRequestBody {
  query?: string
  variables?: Record<string, unknown>
  operationName?: string
}

@Controller('admin/graphql')
export class GraphqlController {
  constructor(
    @Inject(MODERN_ADMIN) private readonly admin: ModernAdmin,
    @Inject(GRAPHQL_SCHEMA) private readonly schema: GraphQLSchema,
  ) {}

  @Get()
  hint(): { ok: true; message: string } {
    return {
      ok: true,
      message: 'POST a GraphQL query to /admin/graphql with { query, variables, operationName }.',
    }
  }

  @Post()
  @HttpCode(200)
  async run(@Body() body: GraphqlRequestBody, @Req() req: AdminRequest): Promise<ExecutionResult> {
    if (!body?.query) {
      return { errors: [new GraphQLError('Missing "query" in request body')] }
    }
    let document: DocumentNode
    try {
      document = parse(body.query)
    } catch (err) {
      return { errors: [err instanceof GraphQLError ? err : new GraphQLError(String(err))] }
    }
    const validationErrors = validate(this.schema, document)
    if (validationErrors.length > 0) return { errors: validationErrors }
    return execute({
      schema: this.schema,
      document,
      contextValue: createContext(this.admin, req.currentAdmin),
      variableValues: body.variables ?? {},
      operationName: body.operationName ?? null,
    })
  }
}
