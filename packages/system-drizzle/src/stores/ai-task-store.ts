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
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm'
import type { DrizzleLike, SystemTables } from '../types.js'

const TERMINAL: AiTaskStatus[] = ['succeeded', 'failed', 'cancelled']

export class DrizzleAiTaskStore implements IAiTaskStore {
  constructor(
    private readonly db: DrizzleLike,
    private readonly taskTable: SystemTables['maAiTask'],
    private readonly eventTable: SystemTables['maAiTaskEvent'],
  ) {}

  async enqueue(input: AiTaskInput): Promise<AiTask> {
    const rows = (await this.db
      .insert(this.taskTable)
      .values({
        id: uuidv7(),
        kind: input.kind,
        resourceId: input.resourceId ?? null,
        recordId: input.recordId ?? null,
        userId: input.userId ?? null,
        status: 'pending',
        input: input.input ?? {},
        progress: null,
      })
      .returning()) as TaskRow[]
    return rowToTask(rows[0]!)
  }

  async get(id: string): Promise<AiTask | null> {
    const rows = (await this.db
      .select()
      .from(this.taskTable)
      .where(eq(this.taskTable.id, id))
      .limit(1)) as TaskRow[]
    return rows[0] ? rowToTask(rows[0]) : null
  }

  async list(filter: Parameters<IAiTaskStore['list']>[0] = {}): Promise<AiTask[]> {
    const conds: SQL[] = []
    if (filter.kind) conds.push(eq(this.taskTable.kind, filter.kind))
    if (filter.status) {
      const list = Array.isArray(filter.status) ? filter.status : [filter.status]
      conds.push(inArray(this.taskTable.status, list))
    }
    if (filter.userId) conds.push(eq(this.taskTable.userId, filter.userId))
    if (filter.resourceId) conds.push(eq(this.taskTable.resourceId, filter.resourceId))

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

    const rows = (await this.db
      .update(this.taskTable)
      .set(data)
      .where(eq(this.taskTable.id, id))
      .returning()) as TaskRow[]
    if (!rows[0]) throw new Error(`AI task not found: ${id}`)
    return rowToTask(rows[0])
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
