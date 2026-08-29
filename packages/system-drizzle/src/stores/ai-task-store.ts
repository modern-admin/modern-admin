import {
  rowToEvent,
  rowToTask,
  uuidv7,
  type AiTask,
  type AiTaskEvent,
  type AiTaskInput,
  type AiTaskStatus,
  type EventRow,
  type IAiTaskStore,
  type TaskRow,
} from '@modern-admin/core'
import { and, asc, desc, eq, gte, inArray, type SQL } from 'drizzle-orm'
import type { DrizzleLike, SystemTables } from '../types.js'

const TERMINAL: AiTaskStatus[] = ['succeeded', 'failed', 'cancelled']

export class DrizzleAiTaskStore implements IAiTaskStore {
  constructor(
    private readonly db: DrizzleLike,
    private readonly taskTable: SystemTables['maAiTask'],
    private readonly eventTable: SystemTables['maAiTaskEvent'],
  ) {}

  async enqueue(input: AiTaskInput): Promise<AiTask> {
    const insert = this.db.insert(this.taskTable).values({
      id: uuidv7(),
      idempotencyKey: input.idempotencyKey ?? null,
      kind: input.kind,
      resourceId: input.resourceId ?? null,
      recordId: input.recordId ?? null,
      userId: input.userId ?? null,
      status: 'pending',
      input: input.input ?? {},
      progress: null,
    })
    const query = input.idempotencyKey
      ? insert.onConflictDoNothing({ target: this.taskTable.idempotencyKey })
      : insert
    const rows = (await query.returning()) as TaskRow[]
    if (rows[0]) return rowToTask(rows[0])
    const existing = await this.getByIdempotencyKey(input.idempotencyKey!)
    if (!existing) throw new Error('Failed to enqueue idempotent AI task')
    return existing
  }

  async get(id: string): Promise<AiTask | null> {
    const rows = (await this.db
      .select()
      .from(this.taskTable)
      .where(eq(this.taskTable.id, id))
      .limit(1)) as TaskRow[]
    return rows[0] ? rowToTask(rows[0]) : null
  }

  async claim(id: string): Promise<AiTask | null> {
    const rows = (await this.db
      .update(this.taskTable)
      .set({ status: 'running', progress: 5, startedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(this.taskTable.id, id), eq(this.taskTable.status, 'pending')))
      .returning()) as TaskRow[]
    return rows[0] ? rowToTask(rows[0]) : null
  }

  async getByIdempotencyKey(idempotencyKey: string): Promise<AiTask | null> {
    const rows = (await this.db
      .select()
      .from(this.taskTable)
      .where(eq(this.taskTable.idempotencyKey, idempotencyKey))
      .limit(1)) as TaskRow[]
    return rows[0] ? rowToTask(rows[0]) : null
  }

  async list(filter: Parameters<IAiTaskStore['list']>[0] = {}): Promise<AiTask[]> {
    const conds: SQL[] = []
    if (filter.kind) conds.push(eq(this.taskTable.kind, filter.kind))
    if (filter.idempotencyKey) conds.push(eq(this.taskTable.idempotencyKey, filter.idempotencyKey))
    if (filter.status) {
      const list = Array.isArray(filter.status) ? filter.status : [filter.status]
      conds.push(inArray(this.taskTable.status, list))
    }
    if (filter.userId) conds.push(eq(this.taskTable.userId, filter.userId))
    if (filter.resourceId) conds.push(eq(this.taskTable.resourceId, filter.resourceId))
    if (filter.createdAfter) {
      conds.push(gte(this.taskTable.createdAt, new Date(filter.createdAfter)))
    }

    let q = this.db.select().from(this.taskTable)
    if (conds.length) q = q.where(conds.length === 1 ? conds[0] : and(...conds))
    q = q.orderBy(desc(this.taskTable.createdAt))
    if (filter.limit !== undefined) q = q.limit(filter.limit)
    const rows = (await q) as TaskRow[]
    return rows.map(rowToTask)
  }

  async updateStatus(
    id: string,
    patch: {
      status: AiTaskStatus
      progress?: number | null
      output?: Record<string, unknown>
      error?: string
      expectedStatus?: AiTaskStatus[]
    },
  ): Promise<AiTask> {
    const data: Record<string, unknown> = { status: patch.status, updatedAt: new Date() }
    if (patch.progress !== undefined) data['progress'] = patch.progress
    if (patch.output !== undefined) data['output'] = patch.output
    if (patch.error !== undefined) data['error'] = patch.error

    if (patch.status === 'running') {
      const existing = (await this.db
        .select()
        .from(this.taskTable)
        .where(eq(this.taskTable.id, id))
        .limit(1)) as TaskRow[]
      if (existing[0] && !existing[0].startedAt) data['startedAt'] = new Date()
    }
    if (TERMINAL.includes(patch.status)) {
      data['finishedAt'] = new Date()
    }

    // Atomic guarded write: the status predicate makes the update a no-op unless
    // the row is still in an expected status, so a concurrent cancel/finalize is
    // never overwritten. Return the current row either way.
    const where = patch.expectedStatus
      ? and(eq(this.taskTable.id, id), inArray(this.taskTable.status, patch.expectedStatus))
      : eq(this.taskTable.id, id)
    const rows = (await this.db
      .update(this.taskTable)
      .set(data)
      .where(where)
      .returning()) as TaskRow[]
    if (rows[0]) return rowToTask(rows[0])
    // No row matched the guard (or the id is unknown): re-read to distinguish.
    const current = (await this.db
      .select()
      .from(this.taskTable)
      .where(eq(this.taskTable.id, id))
      .limit(1)) as TaskRow[]
    if (!current[0]) throw new Error(`AI task not found: ${id}`)
    return rowToTask(current[0])
  }

  async appendEvent(
    taskId: string,
    type: string,
    data: Record<string, unknown>,
  ): Promise<AiTaskEvent> {
    const rows = (await this.db
      .insert(this.eventTable)
      .values({ id: uuidv7(), taskId, type, data })
      .returning()) as EventRow[]
    return rowToEvent(rows[0]!)
  }

  async events(taskId: string, sinceId?: string): Promise<AiTaskEvent[]> {
    const all = (await this.db
      .select()
      .from(this.eventTable)
      .where(eq(this.eventTable.taskId, taskId))
      .orderBy(asc(this.eventTable.createdAt))) as EventRow[]
    if (!sinceId) return all.map(rowToEvent)
    const idx = all.findIndex((r) => r.id === sinceId)
    return (idx < 0 ? all : all.slice(idx + 1)).map(rowToEvent)
  }
}
