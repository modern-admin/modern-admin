import type { DefaultJobOptions } from 'bullmq'

export interface QueueModuleOptions {
  queues: string[]
  flows?: string[]
}

export interface QueueRootOptions {
  /**
   * ioredis-compatible connection. Accepts a connection string
   * (`redis://...`) or a plain options object.
   */
  connection: { host?: string; port?: number; password?: string; db?: number } | string
  /** Default job options applied to every queue in this process. */
  defaultJobOptions?: DefaultJobOptions
}
