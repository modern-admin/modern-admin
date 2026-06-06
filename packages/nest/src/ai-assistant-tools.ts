import { Logger } from '@nestjs/common'
import { tool, type Tool } from 'ai'
import { z } from 'zod/v4'
import {
  chartDefZ,
  type CurrentAdmin,
  type IDashboardStore,
  type ModernAdmin,
  type RecordJSON,
  uuidv7,
} from '@modern-admin/core'
import type { AiUiAction } from './ai-assistant.types.js'

export interface AiAssistantCitation {
  resourceId: string
  recordId?: string
  label: string
}

export interface AiAssistantToolCallTrace {
  toolName: string
  resourceId: string
  action: 'list' | 'show' | 'search'
  summary: string
  citations: AiAssistantCitation[]
}

export interface BuildAiAssistantToolsOptions {
  admin: ModernAdmin
  currentAdmin?: CurrentAdmin
  includeResourceIds?: string[]
  excludeResourceIds?: string[]
  /** Emit verbose server-side diagnostics for tool registration and calls. */
  debug?: boolean
  /** Hard cap on records returned per tool invocation (default 10). */
  maxRecordsPerTool?: number
  /** Hard cap on the number of fields kept per record (default 24). */
  maxFieldsPerRecord?: number
  /**
   * When provided, the `execute_sql` tool is registered and delegates
   * read-only SELECT queries to this function.
   */
  rawQuery?: (sql: string) => Promise<unknown[]>
  /**
   * When provided, the AI assistant can create, read, update, and delete
   * charts on the shared global dashboard.
   */
  dashboardStore?: IDashboardStore
  /**
   * Collector for UI side-effects (navigate / refresh). Tools push into this
   * array; the service surfaces the deduped result via `output.uiActions`.
   */
  uiActions?: AiUiAction[]
}

export interface BuiltAiAssistantTools {
  tools: Record<string, Tool<any, unknown>>
  /** Resource ids that produced at least one tool. */
  resourceIds: string[]
  /** Tool descriptors for logging, debug UI, and system prompt hints. */
  descriptors: Array<{
    name: string
    resourceId: string
    action: 'list' | 'show' | 'search'
  }>
  /** SQL schema hints derived from the selected resources. */
  sqlResources: AiAssistantSqlResource[]
}

type AiTool = Tool<any, unknown>

interface ListToolInput {
  page?: number
  perPage?: number
  sortBy?: string
  direction?: 'asc' | 'desc'
  filters?: Record<string, string | number | boolean>
}

interface ShowToolInput {
  recordId: string
}

interface SearchToolInput {
  query: string
}

const logger = new Logger('AiAssistantTools')

/** JSON-stringify with circular-safety; emits the full payload (no truncation). */
const formatForLog = (value: unknown): string => {
  const seen = new WeakSet<object>()
  let json: string
  try {
    json = JSON.stringify(value, (_key, v) => {
      if (typeof v === 'bigint') return v.toString()
      if (v && typeof v === 'object') {
        if (seen.has(v as object)) return '[Circular]'
        seen.add(v as object)
      }
      return v
    })
  } catch (err) {
    return `[unserializable: ${err instanceof Error ? err.message : String(err)}]`
  }
  if (json == null) return String(value)
  return json
}

/**
 * Wrap a tool's `execute` with uniform debug logging: arguments on entry,
 * elapsed time + full output on exit, error on throw. Returns a new tool
 * object preserving all other properties (description, inputSchema).
 */
const decorateWithDebugLogging = (name: string, value: AiTool): AiTool => {
  const original = (value as { execute?: (input: unknown, ctx?: unknown) => Promise<unknown> }).execute
  if (typeof original !== 'function') return value
  return {
    ...value,
    execute: async (input: unknown, ctx?: unknown): Promise<unknown> => {
      logger.debug(`tool "${name}" called with: ${formatForLog(input)}`)
      const startedAt = Date.now()
      try {
        const result = await original(input, ctx)
        const elapsed = Date.now() - startedAt
        logger.debug(`tool "${name}" returned in ${elapsed}ms: ${formatForLog(result)}`)
        return result
      } catch (err) {
        const elapsed = Date.now() - startedAt
        const message = err instanceof Error ? err.message : String(err)
        logger.error(`tool "${name}" threw after ${elapsed}ms: ${message}`)
        throw err
      }
    },
  } as AiTool
}

const sanitizeToolName = (value: string): string =>
  value.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase()

const filterValueZ = z.union([z.string(), z.number(), z.boolean()])

interface RecordSummary {
  id: string
  title: string
  params: Record<string, unknown>
  /** Number of fields dropped because of `maxFieldsPerRecord`. */
  truncatedFields: number
}

const summarizeRecord = (record: RecordJSON, maxFields: number): RecordSummary => {
  const entries = Object.entries(record.params ?? {})
  const truncatedFields = Math.max(0, entries.length - maxFields)
  return {
    id: String(record.id),
    title: String(record.title ?? record.id),
    params: Object.fromEntries(entries.slice(0, maxFields)),
    truncatedFields,
  }
}

export interface AiAssistantSqlColumn {
  name: string
  type: string
  nullable: boolean
  reference: string | null
}

export interface AiAssistantSqlResource {
  resourceId: string
  tableName: string
  columns: AiAssistantSqlColumn[]
}

interface ResourceCandidate {
  resource: ModernAdmin['resources'][number]
  json: {
    id: string
    navigation: unknown
    actions?: Array<{ name: string }>
  }
  resourceId: string
  baseName: string
  actionNames: Set<string>
}

const scoreResourceCandidate = (candidate: ResourceCandidate): number => {
  let score = 0
  if (candidate.json.navigation !== null) score += 20
  if (/^[a-z]/.test(candidate.resourceId)) score += 10
  if (candidate.resourceId.includes('-') || candidate.resourceId.includes('_')) score += 2
  return score
}

const pickResourceCandidates = (candidates: ResourceCandidate[], debug: boolean): ResourceCandidate[] => {
  const byDatabaseName = new Map<string, ResourceCandidate[]>()
  for (const candidate of candidates) {
    const key = `${candidate.resource.databaseType()}:${candidate.resource.databaseName()}`
    const list = byDatabaseName.get(key) ?? []
    list.push(candidate)
    byDatabaseName.set(key, list)
  }

  const databaseDeduped: ResourceCandidate[] = []
  for (const [key, list] of byDatabaseName.entries()) {
    list.sort((a, b) => scoreResourceCandidate(b) - scoreResourceCandidate(a))
    const winner = list[0]!
    databaseDeduped.push(winner)
    if (debug && list.length > 1) {
      logger.debug(
        `AI tool database resource collision for "${key}"; selected "${winner.resourceId}", skipped ` +
        list.slice(1).map((candidate) => `"${candidate.resourceId}"`).join(', '),
      )
    }
  }

  const grouped = new Map<string, ResourceCandidate[]>()
  for (const candidate of databaseDeduped) {
    const list = grouped.get(candidate.baseName) ?? []
    list.push(candidate)
    grouped.set(candidate.baseName, list)
  }

  const picked: ResourceCandidate[] = []
  for (const list of grouped.values()) {
    list.sort((a, b) => scoreResourceCandidate(b) - scoreResourceCandidate(a))
    const winner = list[0]!
    picked.push(winner)
    if (debug && list.length > 1) {
      logger.debug(
        `AI tool resource collision for "${winner.baseName}"; selected "${winner.resourceId}", skipped ` +
        list.slice(1).map((candidate) => `"${candidate.resourceId}"`).join(', '),
      )
    }
  }
  return picked
}

const buildSqlResource = (candidate: ResourceCandidate): AiAssistantSqlResource => {
  const columns = candidate.resource.properties()
    .filter((property) => {
      const field = (property as { field?: { kind?: string } }).field
      return field?.kind !== 'object'
    })
    .map((property) => ({
      name: property.path(),
      type: String(property.type()),
      nullable: !property.isRequired(),
      reference: property.reference(),
    }))
  return {
    resourceId: candidate.resourceId,
    tableName: candidate.resource.databaseName(),
    columns,
  }
}

/** Max rows returned by execute_sql to keep token count manageable. */
const SQL_MAX_ROWS = 100

/**
 * Validate that `sql` is a read-only SELECT query.
 * Returns an error string if rejected, null if accepted.
 */
const validateSql = (sql: string): string | null => {
  // Strip single-line comments and collapse whitespace for the prefix check.
  const stripped = sql.replace(/--[^\r\n]*/g, '').trimStart()
  if (!/^select\s/i.test(stripped)) {
    return 'Only SELECT queries are allowed. Received: ' + stripped.slice(0, 40)
  }
  // Reject semicolons that could introduce a second statement.
  // A naive check — sufficient given the model-generated context.
  if (/;\s*\S/.test(stripped)) {
    return 'Multiple statements are not allowed. Use a single SELECT query.'
  }
  return null
}

const normalizeSqlInput = (sql: string): string =>
  sql
    .trim()
    .replace(/^```(?:sql)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

const toJsonSafe = (value: unknown): unknown => {
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(toJsonSafe)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, toJsonSafe(item)]),
  )
}

const hintSqlError = (message: string, sqlResources: AiAssistantSqlResource[]): string => {
  const relation = /relation "([^"]+)" does not exist/i.exec(message)?.[1]
  const column = /column (?:[a-zA-Z_][a-zA-Z0-9_]*\.)?([a-zA-Z0-9_]+) does not exist/i.exec(message)?.[1]
  if (!relation && !column) return message
  const tables = sqlResources.map((resource) => resource.tableName)
  if (column) {
    const match = sqlResources
      .flatMap((resource) => resource.columns.map((item) => ({ resource, column: item })))
      .find((item) => item.column.name.toLowerCase() === column.toLowerCase())
    if (match && match.column.name !== column) {
      return `${message}\nHint: column "${match.column.name}" is case-sensitive in PostgreSQL. Use double quotes, for example "${match.resource.tableName}"."${match.column.name}".`
    }
    return `${message}\nHint: PostgreSQL folds unquoted identifiers to lowercase. Use the exact column names from SQL schema hints and wrap camelCase identifiers in double quotes.`
  }
  const resource = sqlResources.find((item) => item.resourceId === relation || item.tableName === relation)
  const hint = resource
    ? `Use table "${resource.tableName}" for resource "${resource.resourceId}".`
    : `Known tables: ${tables.map((table) => `"${table}"`).join(', ')}.`
  return `${message}\nHint: ${hint} SQL must use database table names, not admin resource ids.`
}

export function buildAiAssistantTools({
  admin,
  currentAdmin,
  includeResourceIds,
  excludeResourceIds,
  debug = false,
  maxRecordsPerTool = 10,
  maxFieldsPerRecord = 24,
  rawQuery,
  dashboardStore,
  uiActions,
}: BuildAiAssistantToolsOptions): BuiltAiAssistantTools {
  const include = includeResourceIds ? new Set(includeResourceIds) : null
  const exclude = excludeResourceIds ? new Set(excludeResourceIds) : null
  const tools: Record<string, AiTool> = {}
  const descriptors: BuiltAiAssistantTools['descriptors'] = []
  const resourceIds: string[] = []
  const sqlResources: AiAssistantSqlResource[] = []
  const seenNames = new Set<string>()

  const claimName = (resourceId: string, prefix: 'list' | 'show' | 'search'): string | null => {
    const base = sanitizeToolName(resourceId)
    if (!base) return null
    const name = `${prefix}_${base}`
    if (seenNames.has(name)) {
      if (debug) logger.debug(
        `Skipping duplicate AI tool "${name}" — resource id "${resourceId}" collides with another resource after sanitization`,
      )
      return null
    }
    seenNames.add(name)
    return name
  }

  const candidates: ResourceCandidate[] = []
  for (const resource of admin.resources) {
    const json = resource.decorate().toJSON()
    if (include && !include.has(json.id)) continue
    if (exclude?.has(json.id)) continue
    const baseName = sanitizeToolName(json.id)
    if (!baseName) continue

    const actionNames = new Set((json.actions ?? []).map((action) => action.name))
    candidates.push({ resource, json, resourceId: json.id, baseName, actionNames })
  }

  // Build per-resource date/datetime property map. Used in dashboard chart
  // tools to (a) show the AI which exact paths are valid for `dateField`, and
  // (b) auto-correct the value at execute time when the AI guesses wrong
  // (e.g. assumes "createdAt" when the resource only has "publishedAt").
  const DATE_PROP_TYPES = new Set(['date', 'datetime'])
  const resourceDateFields = new Map<string, string[]>()
  for (const candidate of candidates) {
    const dateProps = candidate.resource.properties()
      .filter((p) => DATE_PROP_TYPES.has(String(p.type())))
      .map((p) => p.path())
    if (dateProps.length > 0) {
      resourceDateFields.set(candidate.resourceId, dateProps)
    }
  }

  for (const candidate of pickResourceCandidates(candidates, debug)) {
    const { resourceId, actionNames } = candidate
    let registered = false

    if (actionNames.has('list')) {
      const name = claimName(resourceId, 'list')
      if (name) {
        tools[name] = tool<ListToolInput, unknown>({
          description: `List records of resource "${resourceId}". Supports paging, sorting, and exact-match filters.`,
          inputSchema: z.object({
            page: z.number().int().positive().optional(),
            perPage: z.number().int().positive().max(maxRecordsPerTool).optional(),
            sortBy: z.string().optional(),
            direction: z.enum(['asc', 'desc']).optional(),
            filters: z.record(z.string(), filterValueZ).optional(),
          }),
          execute: async ({ page, perPage, sortBy, direction, filters }) => {
            const result = await admin.invoke(
              {
                params: { resourceId, action: 'list' },
                method: 'get',
                query: {
                  ...(page !== undefined ? { page } : {}),
                  ...(perPage !== undefined ? { perPage } : {}),
                  ...(sortBy ? { sortBy } : {}),
                  ...(direction ? { direction } : {}),
                  ...(filters
                    ? Object.fromEntries(
                      Object.entries(filters).map(([key, value]) => [`filters.${key}`, value]),
                    )
                    : {}),
                },
              },
              currentAdmin,
            ) as { records?: RecordJSON[]; meta?: { total?: number } }
            const records = (result.records ?? [])
              .slice(0, maxRecordsPerTool)
              .map((record) => summarizeRecord(record, maxFieldsPerRecord))
            return {
              resourceId,
              action: 'list' as const,
              summary: `listed ${records.length} ${resourceId}`,
              total: result.meta?.total ?? records.length,
              records,
              citations: records.map((record) => ({
                resourceId,
                recordId: record.id,
                label: record.title,
              })),
            }
          },
        })
        descriptors.push({ name, resourceId, action: 'list' })
        registered = true
      }
    }

    if (actionNames.has('show')) {
      const name = claimName(resourceId, 'show')
      if (name) {
        tools[name] = tool<ShowToolInput, unknown>({
          description: `Show a single record by id from resource "${resourceId}".`,
          inputSchema: z.object({
            recordId: z.string().min(1),
          }),
          execute: async ({ recordId }) => {
            const result = await admin.invoke(
              {
                params: { resourceId, recordId, action: 'show' },
                method: 'get',
              },
              currentAdmin,
            ) as { record?: RecordJSON }
            const record = result.record ? summarizeRecord(result.record, maxFieldsPerRecord) : null
            return {
              resourceId,
              action: 'show' as const,
              summary: record
                ? `showed ${resourceId}#${record.id}`
                : `no record returned for ${resourceId}#${recordId}`,
              record,
              citations: record
                ? [{ resourceId, recordId: record.id, label: record.title }]
                : [],
            }
          },
        })
        descriptors.push({ name, resourceId, action: 'show' })
        registered = true
      }
    }

    if (actionNames.has('search')) {
      const name = claimName(resourceId, 'search')
      if (name) {
        tools[name] = tool<SearchToolInput, unknown>({
          description: `Search records in resource "${resourceId}" by free-text query.`,
          inputSchema: z.object({
            query: z.string().min(1),
          }),
          execute: async ({ query }) => {
            const result = await admin.invoke(
              {
                params: { resourceId, action: 'search' },
                method: 'get',
                query: { q: query },
              },
              currentAdmin,
            ) as { records?: RecordJSON[] }
            const records = (result.records ?? [])
              .slice(0, maxRecordsPerTool)
              .map((record) => summarizeRecord(record, maxFieldsPerRecord))
            return {
              resourceId,
              action: 'search' as const,
              summary: `searched ${resourceId}: ${records.length} results`,
              records,
              citations: records.map((record) => ({
                resourceId,
                recordId: record.id,
                label: record.title,
              })),
            }
          },
        })
        descriptors.push({ name, resourceId, action: 'search' })
        registered = true
      }
    }

    if (registered) resourceIds.push(resourceId)
    sqlResources.push(buildSqlResource(candidate))
  }

  if (rawQuery) {
    tools['execute_sql'] = tool<{ query: string }, unknown>({
      description:
        'Execute a read-only SQL SELECT query against the host database. ' +
        'Use this for aggregation (COUNT, SUM, AVG), grouping (GROUP BY), ' +
        'sorting (ORDER BY), and JOINs across tables that individual ' +
        'list/show tools cannot express in a single call. ' +
        'Only SELECT queries are permitted. Results are capped at ' +
        SQL_MAX_ROWS + ' rows.',
      inputSchema: z.object({
        query: z.string().min(1).describe(
          'A SQL SELECT query using database table names from the SQL schema hints. No INSERT, UPDATE, DELETE, DROP, or multiple statements.',
        ),
      }),
      execute: async ({ query }) => {
        const normalizedQuery = normalizeSqlInput(query)
        const err = validateSql(normalizedQuery)
        if (err) {
          logger.warn(`execute_sql rejected query: ${err}`)
          return { error: err, rows: [], citations: [] }
        }
        try {
          const rows = await rawQuery(normalizedQuery)
          const truncated = rows.slice(0, SQL_MAX_ROWS).map(toJsonSafe)
          return {
            rows: truncated,
            rowCount: truncated.length,
            truncated: rows.length > SQL_MAX_ROWS,
            citations: [],
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const hinted = hintSqlError(message, sqlResources)
          logger.warn(`execute_sql failed: ${hinted}`)
          return { error: hinted, rows: [], citations: [] }
        }
      },
    })
    descriptors.push({ name: 'execute_sql', resourceId: '__sql__', action: 'list' })
  }

  // ─── Dashboard chart tools ────────────────────────────────────────────
  // Registered only when the host wires a dashboardStore.

  if (dashboardStore) {
    // Compact schema for the AI: just the user-editable fields. IDs and
    // timestamps are generated by the tool itself.
    const chartInputZ = z.object({
      title: z.string().min(1).max(120).describe('Human-readable chart title'),
      resource: z.string().min(1).describe('Resource id (snake_case, matches a registered admin resource)'),
      visualisation: z.enum(['kpi', 'line', 'area', 'bar']).describe(
        'kpi = single KPI tile; line/area/bar = time-series chart',
      ),
      dateField: z.string().min(1).describe(
        'Property path of a date/datetime column to bucket by. ' +
        'MUST be an actual date/datetime property of the chosen resource — ' +
        'never assume "createdAt". ' +
        'See "Available date fields per resource" in the create_dashboard_chart ' +
        'description for the exact valid paths for each resource.',
      ),
      step: z.enum(['day', 'week', 'month', 'year', 'all']).describe(
        'Bucket granularity. Must be "all" for kpi. Use "day"/"week"/"month"/"year" for time-series.',
      ),
      metric: z.enum(['count', 'sum', 'avg', 'min', 'max']).describe('Aggregation function'),
      field: z.string().optional().describe('Property path to aggregate (required for sum/avg/min/max)'),
      groupBy: z.string().optional().describe('Optional secondary breakdown field (produces one series per value)'),
      timeRange: z.enum(['7d', '30d', '90d', '1y', 'all']).default('30d').describe('Default time window'),
      width: z.enum(['half', 'full']).default('half').describe('Tile width: half = 1 of 2 columns, full = full row'),
      filters: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          'Exact-match filters as { "<propertyPath>": "<value>" }. ' +
          'Values MUST be strings — convert numbers/booleans/ids with String(...). ' +
          'Use this whenever the user scopes the chart to a specific entity ' +
          '(e.g. comments for one post: { "postId": "00000000-0004-4000-8000-000000000076" }, ' +
          'orders for one customer: { "customerId": "..." }, posts in a category: { "categoryId": "..." }).',
        ),
      quickFilters: z
        .array(z.string())
        .optional()
        .describe(
          'Property paths from `filters` to expose as editable quick-filter controls above the chart. ' +
          'Optional — omit for one-off scoped charts; include when the dashboard user should be able to retarget the filter.',
        ),
      groupId: z
        .string()
        .uuid()
        .optional()
        .describe(
          'Id of an existing dashboard group to place the chart in. ' +
          'Call list_dashboard_charts first to get available group ids. ' +
          'If omitted the chart goes into the first group (or ungrouped when no groups exist).',
        ),
    })

    tools['list_dashboard_charts'] = tool<Record<never, never>, unknown>({
      description:
        'List all charts and groups currently on the shared dashboard. ' +
        'Always call this before create/update/delete to get current ids and available group ids.',
      inputSchema: z.object({}),
      execute: async () => {
        const blob = await dashboardStore.load('')
        const sortedGroups = [...blob.groups].sort((a, b) => a.order - b.order)
        return {
          groups: sortedGroups.map((g) => ({
            id: g.id,
            name: g.name,
            order: g.order,
          })),
          charts: blob.charts.map((c) => ({
            id: c.id,
            title: c.title,
            resource: c.resource,
            visualisation: c.visualisation,
            step: c.step,
            metric: c.metric,
            width: c.width,
            groupId: c.groupId,
            order: c.order,
          })),
          total: blob.charts.length,
          citations: [],
        }
      },
    })

    const dateFieldsHint = [...resourceDateFields.entries()]
      .map(([id, fields]) => `  ${id}: ${fields.join(', ')}`)
      .join('\n')

    tools['create_dashboard_chart'] = tool({
      description:
        'Create a new chart on the shared dashboard. The chart becomes visible to all admins immediately. ' +
        'Pick a clear title, match resource/dateField/metric to what the user is asking for. ' +
        'Use step="all" + visualisation="kpi" for single-number KPI widgets.\n\n' +
        'Available date fields per resource (use one of these for dateField — never guess):\n' +
        (dateFieldsHint || '  (none detected)'),
      inputSchema: chartInputZ,
      execute: async (input) => {
        const now = new Date().toISOString()
        const blob = await dashboardStore.load('')
        const sortedGroups = [...blob.groups].sort((a, b) => a.order - b.order)
        // Prefer the explicitly requested group; fall back to first group.
        const resolvedGroupId =
          (input.groupId && sortedGroups.some((g) => g.id === input.groupId))
            ? input.groupId
            : sortedGroups[0]?.id
        // Auto-correct dateField: if the AI provided a path that isn't a
        // known date/datetime property, silently use the first known one.
        const knownDateFields = resourceDateFields.get(input.resource) ?? []
        const resolvedDateField = (() => {
          if (knownDateFields.length === 0 || knownDateFields.includes(input.dateField)) {
            return input.dateField
          }
          const fallback = knownDateFields[0]!
          logger.warn(
            `AI chart: dateField "${input.dateField}" not found on resource ` +
            `"${input.resource}"; auto-using "${fallback}"`,
          )
          return fallback
        })()
        const parseResult = chartDefZ.safeParse({
          id: uuidv7(),
          title: input.title,
          resource: input.resource,
          visualisation: input.visualisation,
          dateField: resolvedDateField,
          step: input.step,
          metric: input.metric,
          ...(input.field ? { field: input.field } : {}),
          ...(input.groupBy ? { groupBy: input.groupBy } : {}),
          filters: input.filters ?? {},
          quickFilters: input.quickFilters ?? [],
          topN: 10,
          width: input.width,
          timeRange: { preset: input.timeRange },
          ...(resolvedGroupId ? { groupId: resolvedGroupId } : {}),
          createdAt: now,
          updatedAt: now,
        })
        if (!parseResult.success) {
          return { ok: false, error: parseResult.error.message, citations: [] }
        }
        const chart = parseResult.data
        await dashboardStore.save('', {
          version: 1,
          charts: [...blob.charts, chart],
          groups: blob.groups,
        })
        logger.log(`AI created dashboard chart "${chart.title}" (${chart.id})`)
        uiActions?.push({ kind: 'refresh', target: 'dashboard' })
        return { ok: true, id: chart.id, title: chart.title, citations: [] }
      },
    }) as AiTool

    tools['update_dashboard_chart'] = tool({
      description:
        'Update an existing dashboard chart by id. Use list_dashboard_charts first to find the id. ' +
        'Only the fields you pass are changed — omit a field to keep its current value.',
      inputSchema: z.object({
        id: z.string().min(1).describe('Chart id from list_dashboard_charts'),
        patch: chartInputZ.partial().describe('Fields to update'),
      }),
      execute: async ({ id, patch }) => {
        const blob = await dashboardStore.load('')
        const idx = blob.charts.findIndex((c) => c.id === id)
        if (idx < 0) return { ok: false, error: `Chart not found: ${id}`, citations: [] }
        const prev = blob.charts[idx]!
        // Validate groupId patch against existing groups.
        const patchGroupId = patch.groupId
          ? (blob.groups.some((g) => g.id === patch.groupId) ? patch.groupId : undefined)
          : undefined
        // Auto-correct dateField patch for the same reason as in create.
        const patchDateField = (() => {
          if (!patch.dateField) return undefined
          const known = resourceDateFields.get(prev.resource) ?? []
          if (known.length === 0 || known.includes(patch.dateField)) return patch.dateField
          const fallback = known[0]!
          logger.warn(
            `AI chart update: dateField "${patch.dateField}" not found on ` +
            `"${prev.resource}"; auto-using "${fallback}"`,
          )
          return fallback
        })()
        const merged = {
          ...prev,
          ...patch,
          ...(patchDateField !== undefined ? { dateField: patchDateField } : {}),
          ...(patchGroupId !== undefined ? { groupId: patchGroupId } : {}),
          ...(patch.timeRange ? { timeRange: { preset: patch.timeRange } } : {}),
          id,
          updatedAt: new Date().toISOString(),
        }
        const parseResult = chartDefZ.safeParse(merged)
        if (!parseResult.success) {
          return { ok: false, error: parseResult.error.message, citations: [] }
        }
        const updated = [...blob.charts]
        updated[idx] = parseResult.data
        await dashboardStore.save('', { version: 1, charts: updated, groups: blob.groups })
        logger.log(`AI updated dashboard chart "${parseResult.data.title}" (${id})`)
        uiActions?.push({ kind: 'refresh', target: 'dashboard' })
        return { ok: true, id, title: parseResult.data.title, citations: [] }
      },
    }) as AiTool

    tools['delete_dashboard_chart'] = tool({
      description: 'Remove a chart from the shared dashboard by id.',
      inputSchema: z.object({
        id: z.string().min(1).describe('Chart id from list_dashboard_charts'),
      }),
      execute: async ({ id }) => {
        const blob = await dashboardStore.load('')
        const chart = blob.charts.find((c) => c.id === id)
        if (!chart) return { ok: false, error: `Chart not found: ${id}`, citations: [] }
        await dashboardStore.save('', {
          version: 1,
          charts: blob.charts.filter((c) => c.id !== id),
          groups: blob.groups,
        })
        logger.log(`AI deleted dashboard chart "${chart.title}" (${id})`)
        uiActions?.push({ kind: 'refresh', target: 'dashboard' })
        return { ok: true, id, title: chart.title, citations: [] }
      },
    }) as AiTool
  }

  // ─── Navigation tool ──────────────────────────────────────────────────
  // Always registered when uiActions collector is available. Lets the AI
  // ask the frontend to navigate the user to a safe, read-only page.
  if (uiActions) {
    const navigateRouteZ = z.discriminatedUnion('name', [
      z.object({ name: z.literal('home') }),
      z.object({ name: z.literal('audit-log') }),
      z.object({
        name: z.literal('list'),
        resourceId: z.string().min(1).describe('Resource id from the resources list'),
      }),
      z.object({
        name: z.literal('show'),
        resourceId: z.string().min(1).describe('Resource id from the resources list'),
        recordId: z.string().min(1).describe('Record primary key'),
      }),
      z.object({
        name: z.literal('settings'),
        section: z.string().min(1).optional().describe('Optional settings section id'),
      }),
    ])

    tools['navigate_to'] = tool<{ route: z.infer<typeof navigateRouteZ> }, unknown>({
      description:
        'Navigate the user to a different admin page. Use this when the user asks to "open", "go to", or "show me" a specific record, the audit log, or settings. ' +
        'Strictly read-only navigation: no edit / new / delete targets. ' +
        'Always verify the resource/record exists by calling a show or list tool first when in doubt.',
      inputSchema: z.object({
        route: navigateRouteZ.describe('Target route. Mirrors the safe subset of admin pages.'),
      }),
      execute: async ({ route }) => {
        uiActions.push({ kind: 'navigate', route })
        return { ok: true, route, citations: [] }
      },
    })
    descriptors.push({ name: 'navigate_to', resourceId: '__ui__', action: 'list' })
  }

  // ─── Debug instrumentation ────────────────────────────────────────────
  // When debug is on, wrap every tool's execute with input/output/timing
  // logs so the operator can trace exactly what the assistant called and
  // what came back, without editing each tool individually.
  if (debug) {
    for (const name of Object.keys(tools)) {
      tools[name] = decorateWithDebugLogging(name, tools[name]!)
    }
  }

  return { tools, resourceIds, descriptors, sqlResources }
}
