import { z } from 'zod'

// Wire-level DTOs validated with Zod at the controller boundary. Each shape
// translates to OpenAPI through nestjs-zod (or equivalent) — but for now we
// keep the tooling integration optional and validate explicitly inside the
// controller to avoid forcing a global pipe on consumers.

export const listQueryZ = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(200).default(20),
    sortBy: z.string().optional(),
    direction: z.enum(['asc', 'desc']).optional(),
    filters: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()
export type ListQuery = z.infer<typeof listQueryZ>

export const recordIdParamZ = z.object({
  resourceId: z.string().min(1),
  recordId: z.string().min(1),
})
export type RecordIdParam = z.infer<typeof recordIdParamZ>

export const resourceParamZ = z.object({
  resourceId: z.string().min(1),
})
export type ResourceParam = z.infer<typeof resourceParamZ>

export const bulkBodyZ = z.object({
  recordIds: z.array(z.string().min(1)).min(1),
})
export type BulkBody = z.infer<typeof bulkBodyZ>

export const createBodyZ = z.record(z.string(), z.unknown())
export const updateBodyZ = z.record(z.string(), z.unknown())
