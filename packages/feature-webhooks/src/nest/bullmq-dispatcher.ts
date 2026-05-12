import { InjectQueue } from '@nestjs/bullmq'
import type { Queue } from 'bullmq'
import { WEBHOOK_QUEUE } from './constants.js'
import type { IWebhookDispatcher, WebhookJob } from '../types.js'

export class BullMqWebhookDispatcher implements IWebhookDispatcher {
  constructor(@InjectQueue(WEBHOOK_QUEUE) private readonly queue: Queue<WebhookJob>) {}

  async enqueue(job: WebhookJob): Promise<void> {
    await this.queue.add(job.event, job, {
      jobId: `${job.webhookId}:${job.payload.id}`,
      attempts: 7,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 1000 },
    })
  }
}
