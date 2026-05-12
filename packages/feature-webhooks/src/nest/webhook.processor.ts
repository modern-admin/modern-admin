import { Inject, Optional } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import type { IWebhookStore } from '@modern-admin/core'
import { deliverWebhookJob } from '../delivery.js'
import type { WebhookDeliveryOptions, WebhookJob } from '../types.js'
import {
  MODERN_ADMIN_WEBHOOK_OPTIONS,
  MODERN_ADMIN_WEBHOOK_STORE,
  WEBHOOK_QUEUE,
} from './constants.js'

@Processor(WEBHOOK_QUEUE)
export class WebhookProcessor extends WorkerHost {
  constructor(
    @Inject(MODERN_ADMIN_WEBHOOK_STORE) private readonly store: IWebhookStore,
    @Optional()
    @Inject(MODERN_ADMIN_WEBHOOK_OPTIONS)
    private readonly options?: WebhookDeliveryOptions,
  ) {
    super()
  }

  async process(job: Job<WebhookJob>): Promise<void> {
    await deliverWebhookJob(this.store, job.data, job.attemptsMade + 1, this.options)
  }
}
