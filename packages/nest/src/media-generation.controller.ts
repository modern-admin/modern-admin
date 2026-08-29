import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common'
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'
import type { CurrentAdmin } from '@modern-admin/core'
import { ModernAdminAuthGuard } from './auth.guard.js'
import { MediaGenerationService } from './media-generation.service.js'

interface AdminRequest {
  currentAdmin?: CurrentAdmin
}

const settingsBodyZ = z.object({
  enabled: z.boolean(),
  apiKey: z.string().max(500).optional(),
})

const createTaskBodyZ = z.object({
  requestId: z.string().min(1).max(120),
  model: z.string().min(1).max(200),
  input: z.record(z.string(), z.unknown()),
  resourceId: z.string().min(1).max(200).optional(),
  recordId: z.string().min(1).max(500).optional(),
  actionName: z.string().min(1).max(200).optional(),
})

const applyBodyZ = z.object({
  fileIndex: z.number().int().min(0),
  replaceExisting: z.boolean().optional(),
})

@ApiTags('Admin / Media Generation')
@ApiCookieAuth('session')
@Controller('admin/api/media-generation')
@UseGuards(ModernAdminAuthGuard)
export class MediaGenerationController {
  constructor(private readonly service: MediaGenerationService) {}

  @Get('settings')
  getSettings(@Req() req: AdminRequest) {
    return this.service.getSettings(req.currentAdmin)
  }

  @Put('settings')
  updateSettings(@Body() body: unknown, @Req() req: AdminRequest) {
    return this.service.updateSettings(settingsBodyZ.parse(body), req.currentAdmin)
  }

  @Get('catalog')
  getCatalog(@Req() req: AdminRequest) {
    return this.service.getCatalog(req.currentAdmin)
  }

  @Post('tasks')
  createTask(@Body() body: unknown, @Req() req: AdminRequest) {
    return this.service.createTask(createTaskBodyZ.parse(body), req.currentAdmin)
  }

  @Get('tasks/:taskId')
  getTask(@Param('taskId') taskId: string, @Req() req: AdminRequest) {
    return this.service.getTask(taskId, req.currentAdmin)
  }

  @Post('tasks/:taskId/cancel')
  cancelTask(@Param('taskId') taskId: string, @Req() req: AdminRequest) {
    return this.service.cancelTask(taskId, req.currentAdmin)
  }

  @Post('tasks/:taskId/apply')
  applyResult(@Param('taskId') taskId: string, @Body() body: unknown, @Req() req: AdminRequest) {
    return this.service.applyResult(taskId, applyBodyZ.parse(body), req.currentAdmin)
  }
}

const webhookBodyZ = z
  .object({
    data: z.object({ taskId: z.string().min(1) }),
  })
  .passthrough()

/** Public callback surface. Per-task HMAC tokens replace session authentication. */
@ApiTags('Admin / Media Generation Webhook')
@Controller('admin/api/media-generation/webhook')
export class MediaGenerationWebhookController {
  constructor(private readonly service: MediaGenerationService) {}

  @Post(':taskId/:token')
  receive(@Param('taskId') taskId: string, @Param('token') token: string, @Body() body: unknown) {
    const parsed = webhookBodyZ.parse(body)
    return this.service.processWebhook(taskId, token, parsed.data.taskId)
  }
}
