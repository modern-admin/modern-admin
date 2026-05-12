import type { IWebhookDispatcher, WebhookJob } from './types.js'

export class NoopWebhookDispatcher implements IWebhookDispatcher {
  public readonly jobs: WebhookJob[] = []

  enqueue(job: WebhookJob): void {
    this.jobs.push(job)
  }
}
