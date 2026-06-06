import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger'
import {
  ForbiddenError,
  type ModernAdmin,
  type ListActionResponse,
  type RecordJSON,
  type CurrentAdmin,
} from '@modern-admin/core'
import { z } from 'zod'
import { MODERN_ADMIN } from './tokens.js'
import { ModernAdminAuthGuard } from './auth.guard.js'

interface AdminRequest {
  currentAdmin?: CurrentAdmin
}

const queryZ = z.object({
  q: z.string().trim().min(1).max(200),
  /** Max hits per resource. Default 5. */
  perResourceLimit: z.coerce.number().int().min(1).max(20).optional(),
})

export interface GlobalSearchHit {
  resourceId: string
  resourceName: string
  recordId: string
  title: string
  /** Property path where the query was found (omitted if match is on the title). */
  matchedField?: string
  /** ~80-char snippet centered on the substring match. Empty when query is the id. */
  snippet?: string
  /** Score used for ranking; higher = more relevant. */
  score: number
}

export interface GlobalSearchGroup {
  resourceId: string
  resourceName: string
  records: GlobalSearchHit[]
}

export interface GlobalSearchResponse {
  query: string
  groups: GlobalSearchGroup[]
  total: number
}

const SNIPPET_WINDOW = 40

/**
 * Build a substring snippet centered on the first case-insensitive match
 * of `needle` inside `value`. Returns `null` if no match. Leading/trailing
 * ellipses indicate truncation; whitespace is collapsed for compactness.
 */
const buildSnippet = (value: string, needle: string): string | null => {
  const haystack = String(value).replace(/\s+/g, ' ').trim()
  if (haystack.length === 0) return null
  const idx = haystack.toLowerCase().indexOf(needle.toLowerCase())
  if (idx === -1) return null
  const start = Math.max(0, idx - SNIPPET_WINDOW)
  const end = Math.min(haystack.length, idx + needle.length + SNIPPET_WINDOW)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < haystack.length ? '…' : ''
  return `${prefix}${haystack.slice(start, end)}${suffix}`
}

interface MatchInfo {
  matchedField?: string
  snippet?: string
  score: number
}

/**
 * Discover where (and how strongly) `needle` matched on a record's payload.
 *
 *   1000 — record id matches exactly
 *    900 — title matches exactly
 *    700 — title starts with the needle
 *    500 — title contains the needle
 *    300 — any other string field contains the needle
 *    100 — record id contains the needle as substring (UUID picker case)
 *
 * The score is identical to the core search ranking — we recompute it on
 * the wire side because the inner action doesn't expose it on RecordJSON.
 */
const describeMatch = (record: RecordJSON, needle: string): MatchInfo => {
  const q = needle.toLowerCase()
  const idStr = String(record.id).toLowerCase()
  if (idStr === q) return { score: 1000 }

  const title = String(record.title ?? '').trim()
  const titleLower = title.toLowerCase()
  if (title) {
    if (titleLower === q) return { score: 900 }
    if (titleLower.startsWith(q)) return { score: 700 }
    if (titleLower.includes(q)) {
      const snippet = buildSnippet(title, needle)
      return { score: 500, ...(snippet ? { snippet } : {}) }
    }
  }

  // Walk params (single level — title fields are flat by convention; nested
  // bag fields rarely contain searchable text).
  for (const [key, value] of Object.entries(record.params ?? {})) {
    if (value == null) continue
    if (typeof value !== 'string' && typeof value !== 'number') continue
    const str = String(value)
    if (!str.toLowerCase().includes(q)) continue
    const snippet = buildSnippet(str, needle)
    return {
      score: 300,
      matchedField: key,
      ...(snippet ? { snippet } : {}),
    }
  }

  if (idStr.includes(q)) return { score: 100 }
  return { score: 0 }
}

/**
 * Cross-resource search: fans `q` out to every registered resource's built-in
 * `search` action via `ModernAdmin.invoke()`. Per-resource access gates
 * (api-key / role / `isAccessible`) are honoured — denied resources are
 * silently skipped so the dropdown only surfaces what the principal can see.
 *
 * Each hit is annotated with a `matchedField` + `snippet` + `score` so the
 * frontend can show the operator *why* a record matched (e.g. "matched in
 * `description`: …pioneered by Ada…"). Groups are sorted so resources whose
 * best hit is a title/id match outrank those that only matched on a body
 * field.
 */
@ApiTags('Admin / Global Search')
@ApiCookieAuth('session')
@Controller('admin/api/global-search')
@UseGuards(ModernAdminAuthGuard)
export class GlobalSearchController {
  constructor(@Inject(MODERN_ADMIN) private readonly admin: ModernAdmin) {}

  @Get()
  async search(
    @Query() rawQuery: Record<string, unknown>,
    @Req() req: AdminRequest,
  ): Promise<GlobalSearchResponse> {
    const parsed = queryZ.safeParse(rawQuery)
    if (!parsed.success) throw new BadRequestException(parsed.error.message)
    const { q, perResourceLimit } = parsed.data
    const limit = perResourceLimit ?? 5

    const results = await Promise.all(
      this.admin.resources.map(async (resource): Promise<GlobalSearchGroup | null> => {
        const decorated = resource.decorate()
        // Skip resources where the `search` action is not defined (custom
        // resources may opt out by overriding their action list).
        if (!decorated.getAction('search')) return null
        try {
          const response = (await this.admin.invoke(
            {
              params: { resourceId: decorated.id, action: 'search', query: q },
              method: 'get',
              query: { q },
            },
            req.currentAdmin,
          )) as ListActionResponse
          const records = response.records ?? []
          if (records.length === 0) return null

          const ranked = records
            .map((r: RecordJSON) => {
              const match = describeMatch(r, q)
              const hit: GlobalSearchHit = {
                resourceId: decorated.id,
                resourceName: decorated.name,
                recordId: String(r.id),
                title: r.title ?? String(r.id),
                score: match.score,
                ...(match.matchedField ? { matchedField: match.matchedField } : {}),
                ...(match.snippet ? { snippet: match.snippet } : {}),
              }
              return hit
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)

          return {
            resourceId: decorated.id,
            resourceName: decorated.name,
            records: ranked,
          }
        } catch (err) {
          // Access denied / search not accessible → drop silently. Anything
          // else is swallowed too so one broken adapter cannot poison the
          // whole palette; the caller still sees results from healthy ones.
          if (err instanceof ForbiddenError) return null
          return null
        }
      }),
    )

    const groups = results
      .filter((g): g is GlobalSearchGroup => g !== null)
      .sort((a, b) => {
        const aScore = a.records[0]?.score ?? 0
        const bScore = b.records[0]?.score ?? 0
        if (aScore !== bScore) return bScore - aScore
        return a.resourceName.localeCompare(b.resourceName)
      })
    const total = groups.reduce((sum, g) => sum + g.records.length, 0)
    return { query: q, groups, total }
  }
}
