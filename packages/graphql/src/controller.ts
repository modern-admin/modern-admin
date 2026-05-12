// HTTP entrypoint for the dynamic admin schema. Single POST endpoint that
// executes a query/mutation against the prebuilt schema, plus a GET fallback
// that ships an introspection-friendly hint.

import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Req,
} from '@nestjs/common'
import type { IncomingMessage } from 'node:http'
import {
  type DocumentNode,
  GraphQLError,
  parse,
  validate,
  execute,
  type ExecutionResult,
} from 'graphql'
import { MODERN_ADMIN } from '@modern-admin/nest'
import type { ModernAdmin } from '@modern-admin/core'
import { ModernAdminGraphqlSchemaHolder } from './schema-holder.js'
import { createContext } from './schema-builder.js'
import { GRAPHQL_OPTIONS } from './tokens.js'
import { SANDBOX_HTML } from './sandbox-html.js'
import type { ResolvedGraphqlOptions } from './module.js'
import { parseMultipartGraphqlRequest } from './multipart.js'

interface AdminRequest extends IncomingMessage {
  currentAdmin?: { id: string; [key: string]: unknown }
  body?: unknown
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
    private readonly schemaHolder: ModernAdminGraphqlSchemaHolder,
    @Inject(GRAPHQL_OPTIONS) private readonly options: ResolvedGraphqlOptions,
  ) {}

  @Get()
  hint(): { ok: true; message: string; sandbox?: string } {
    return {
      ok: true,
      message: 'POST a GraphQL query to /admin/graphql with { query, variables, operationName }.',
      ...(this.options.sandbox ? { sandbox: '/admin/graphql/sandbox' } : {}),
    }
  }

  /**
   * Apollo's embeddable Sandbox served at `GET /admin/graphql/sandbox`. The
   * Sandbox UI is loaded from Apollo's CDN; toggle off via
   * `ModernAdminGraphqlModule.forRoot({ sandbox: false })`.
   */
  @Get('sandbox')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-cache')
  sandbox(): string {
    if (!this.options.sandbox) {
      throw new NotFoundException('Sandbox is disabled')
    }
    return SANDBOX_HTML
  }

  @Post()
  @HttpCode(200)
  async run(@Body() body: GraphqlRequestBody, @Req() req: AdminRequest): Promise<ExecutionResult> {
    // 1 — Pick up multipart-encoded uploads if present, otherwise fall back to
    //     the standard JSON body. Multipart wire format is the GraphQL
    //     multipart request spec; see ./multipart.ts for the decoder.
    let query: string | undefined
    let variables: Record<string, unknown>
    let operationName: string | null
    try {
      const multipart = await parseMultipartGraphqlRequest(req)
      if (multipart) {
        query = multipart.query
        variables = multipart.variables
        operationName = multipart.operationName
      } else {
        query = body?.query
        variables = body?.variables ?? {}
        operationName = body?.operationName ?? null
      }
    } catch (err) {
      return { errors: [new GraphQLError(err instanceof Error ? err.message : String(err))] }
    }

    if (!query) {
      return { errors: [new GraphQLError('Missing "query" in request body')] }
    }
    let document: DocumentNode
    try {
      document = parse(query)
    } catch (err) {
      return { errors: [err instanceof GraphQLError ? err : new GraphQLError(String(err))] }
    }
    const schema = this.schemaHolder.get()
    const validationErrors = validate(schema, document)
    if (validationErrors.length > 0) return { errors: validationErrors }
    return execute({
      schema,
      document,
      contextValue: createContext(this.admin, req.currentAdmin),
      variableValues: variables,
      operationName,
    })
  }
}
