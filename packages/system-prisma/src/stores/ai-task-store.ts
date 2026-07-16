import {
  rowToEvent,
  rowToTask,
  uuidv7,
  type AiTask,
  type AiTaskEvent,
  type AiTaskInput,
  type AiTaskStatus,
  type IAiTaskStore,
  type EventRow,
  type TaskRow,
} from '@modern-admin/core'
import type { PrismaDelegate } from '../types.js'

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
