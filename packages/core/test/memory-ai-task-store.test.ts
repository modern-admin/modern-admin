import { describe, expect, it } from 'bun:test'
import { MemoryAiTaskStore } from '@modern-admin/core'

describe('MemoryAiTaskStore.updateStatus guard', () => {
  it('applies the write when the current status is one of expectedStatus', async () => {
    const store = new MemoryAiTaskStore()
    const task = await store.enqueue({ kind: 'media-generation', input: {} })
    await store.claim(task.id) // pending -> running

    const updated = await store.updateStatus(task.id, {
      status: 'succeeded',
      progress: 100,
      expectedStatus: ['pending', 'running'],
    })

    expect(updated.status).toBe('succeeded')
  })

  it('is a no-op when the current status is not in expectedStatus', async () => {
    const store = new MemoryAiTaskStore()
    const task = await store.enqueue({ kind: 'media-generation', input: {} })
    await store.claim(task.id)
    await store.updateStatus(task.id, { status: 'cancelled', progress: 100 })

    // A late provider completion must not resurrect a cancelled task.
    const result = await store.updateStatus(task.id, {
      status: 'succeeded',
      progress: 100,
      expectedStatus: ['pending', 'running'],
    })

    expect(result.status).toBe('cancelled')
    expect((await store.get(task.id))?.status).toBe('cancelled')
  })
})
