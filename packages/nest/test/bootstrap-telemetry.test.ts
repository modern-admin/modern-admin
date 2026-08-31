import { describe, expect, test } from 'bun:test'
import { HttpAdapterHost } from '@nestjs/core'
import { ModernAdmin } from '@modern-admin/core'
import { AdminControllerScanner, ModernAdminBootstrapService } from '../src/admin'

const buildService = (telemetry: () => void | Promise<void>): ModernAdminBootstrapService =>
  new ModernAdminBootstrapService(
    new ModernAdmin(),
    { telemetry },
    { scan: () => [] } as unknown as AdminControllerScanner,
    { httpAdapter: undefined } as unknown as HttpAdapterHost,
  )

describe('ModernAdminBootstrapService telemetry boundary', () => {
  test('isolates a synchronous telemetry adapter failure', async () => {
    const service = buildService(() => {
      throw new Error('telemetry failed synchronously')
    })

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined()
  })

  test('isolates an asynchronous telemetry adapter failure', async () => {
    const service = buildService(() => Promise.reject(new Error('telemetry failed asynchronously')))

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined()
  })
})
