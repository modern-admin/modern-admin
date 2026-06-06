import { Logger } from '@nestjs/common'
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import { AI_ASSISTANT_CHAT_JOB, AI_ASSISTANT_QUEUE } from './ai-assistant.constants.js'
import type { AiAssistantChatJobData } from './ai-assistant.types.js'
import { AiAssistantService } from './ai-assistant.service.js'

@Processor(AI_ASSISTANT_QUEUE)
export class AiAssistantProcessor extends WorkerHost {
  private readonly logger = new Logger(AiAssistantProcessor.name)

  constructor(private readonly aiAssistantService: AiAssistantService) {
    super()
  }

  async process(job: Job<AiAssistantChatJobData>): Promise<unknown> {
    if (job.name !== AI_ASSISTANT_CHAT_JOB) {
      throw new Error(`Unsupported AI assistant job: ${job.name}`)
    }
    return this.aiAssistantService.runChatJob(job.data)
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.debug(`AI assistant job ${job.id} completed`)
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(`AI assistant job ${job?.id ?? 'unknown'} failed: ${error.message}`)
  }
}
