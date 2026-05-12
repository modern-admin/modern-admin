import { DynamicModule, Module, type Provider } from '@nestjs/common'
import type { IWebhookStore } from '@modern-admin/core'
import { QueueModule } from '@modern-admin/queue'
import type { WebhookDeliveryOptions } from '../types.js'
import { BullMqWebhookDispatcher } from './bullmq-dispatcher.js'
import {
  MODERN_ADMIN_WEBHOOK_OPTIONS,
  MODERN_ADMIN_WEBHOOK_STORE,
  WEBHOOK_QUEUE,
} from './constants.js'
import { WebhookProcessor } from './webhook.processor.js'

export interface WebhookQueueModuleOptions extends WebhookDeliveryOptions {
  store: IWebhookStore
}

@Module({})
export class WebhookQueueModule {
  static register(options: WebhookQueueModuleOptions): DynamicModule {
    const providers: Provider[] = [
      { provide: MODERN_ADMIN_WEBHOOK_STORE, useValue: options.store },
      { provide: MODERN_ADMIN_WEBHOOK_OPTIONS, useValue: options },
      BullMqWebhookDispatcher,
      WebhookProcessor,
    ]
    return {
      module: WebhookQueueModule,
      imports: [QueueModule.register({ queues: [WEBHOOK_QUEUE] })],
      providers,
      exports: [BullMqWebhookDispatcher],
    }
  }
}
