import {
  uuidv7,
  type AiTask,
  type AiTaskEvent,
  type AiTaskInput,
  type AiTaskStatus,
  type IAiTaskStore,
} from '@modern-admin/core'
import type { PrismaDelegate } from '../types.js'

interface TaskRow {
  id: string
  kind: string
  resourceId: string | null
  recordId: string | null
  userId: string | null
  status: string
  input: unknown
  output: unknown
  error: string | null
  progress: number | null
  createdAt: Date
  updatedAt: Date
  startedAt: Date | null
  finishedAt: Date | null
}

interface EventRow {
  id: string
  taskId: string
  type: string
  data: unknown
  createdAt: Date
}

const rowToTask = (row: TaskRow): AiTask => ({
  id: row.id,
  kind: row.kind,
  ...(row.resourceId !== null ? { resourceId: row.resourceId } : {}),
  ...(row.recordId !== null ? { recordId: row.recordId } : {}),
  ...(row.userId !== null ? { userId: row.userId } : {}),
  status: row.status as AiTaskStatus,
  input: (row.input as Record<string, unknown>) ?? {},
  ...(row.output !== null && row.output !== undefined
    ? { output: row.output as Record<string, unknown> }
    : {}),
  ...(row.error !== null ? { error: row.error } : {}),
  progress: row.progress,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  ...(row.startedAt !== null ? { startedAt: row.startedAt.toISOString() } : {}),
  ...(row.finishedAt !== null ? { finishedAt: row.finishedAt.toISOString() } : {}),
})

const rowToEvent = (row: EventRow): AiTaskEvent => ({
  id: row.id,
  taskId: row.taskId,
  type: row.type,
  data: (row.data as Record<string, unknown>) ?? {},
  createdAt: row.createdAt.toISOString(),
})

const TERMINAL: AiTaskStatus[] = ['succeeded', 'failed', 'cancelled']

export class PrismaAiTaskStore implements IAiTaskStore {
  constructor(
    private readonly taskDelegate: PrismaDelegate<TaskRow>,
    private readonly eventDelegate: PrismaDelegate<EventRow>,
  ) {}

  async enqueue(input: AiTaskInput): Promise<AiTask> {
    const row = await this.taskDelegate.create({
      data: {
        id: uuidv7(),
        kind: input.kind,
        resourceId: input.resourceId ?? null,
        recordId: input.recordId ?? null,
        userId: input.userId ?? null,
        status: 'pending',
        input: input.input ?? {},
        progress: null,
      },
    })
    return rowToTask(row)
  }

  async get(id: string): Promise<AiTask | null> {
    const row = await this.taskDelegate.findUnique({ where: { id } })
    return row ? rowToTask(row) : null
  }

  async list(filter: Parameters<IAiTaskStore['list']>[0] = {}): Promise<AiTask[]> {
    const where: Record<string, unknown> = {}
    if (filter.kind) where['kind'] = filter.kind
    if (filter.status) {
      const list = Array.isArray(filter.status) ? filter.status : [filter.status]
      where['status'] = { in: list }
    }
    if (filter.userId) where['userId'] = filter.userId
    if (filter.resourceId) where['resourceId'] = filter.resourceId
    const rows = await this.taskDelegate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...(filter.limit !== undefined ? { take: filter.limit } : {}),
    })
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
    const data: Record<string, unknown> = { status: patch.status }
    if (patch.progress !== undefined) data['progress'] = patch.progress
    if (patch.output !== undefined) data['output'] = patch.output
    if (patch.error !== undefined) data['error'] = patch.error
    if (patch.status === 'running') {
      // only set startedAt the first time we transition to running
      const current = await this.taskDelegate.findUnique({ where: { id } })
      if (current && !current.startedAt) data['startedAt'] = new Date()
    }
    if (TERMINAL.includes(patch.status)) {
      data['finishedAt'] = new Date()
    }
    const row = await this.taskDelegate.update({ where: { id }, data })
    return rowToTask(row)
  }

  async appendEvent(
    taskId: string,
    type: string,
    data: Record<string, unknown>,
  ): Promise<AiTaskEvent> {
    const row = await this.eventDelegate.create({
      data: { id: uuidv7(), taskId, type, data },
    })
    return rowToEvent(row)
  }

  async events(taskId: string, sinceId?: string): Promise<AiTaskEvent[]> {
    const all = await this.eventDelegate.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
    })
    if (!sinceId) return all.map(rowToEvent)
    const idx = all.findIndex((r) => r.id === sinceId)
    return (idx < 0 ? all : all.slice(idx + 1)).map(rowToEvent)
  }
}
