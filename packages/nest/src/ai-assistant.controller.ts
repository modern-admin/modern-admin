import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common'
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'
import type { CurrentAdmin } from '@modern-admin/core'
import { ModernAdminAuthGuard } from './auth.guard.js'
import { AiAssistantService, type AiAssistantPublicSettings } from './ai-assistant.service.js'

interface AdminRequest {
  currentAdmin?: CurrentAdmin
  [key: string]: unknown
}

const settingsBodyZ = z.object({
  enabled: z.boolean(),
  model: z.string().min(1).max(200),
  apiKey: z.string().max(500).optional(),
  systemPrompt: z.string().max(10_000).optional(),
})

const chatMessageZ = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
})

const clientContextZ = z.object({
  pathname: z.string().min(1).max(2000).optional(),
}).optional()

const chatBodyZ = z.object({
  messages: z.array(chatMessageZ).min(1),
  requestId: z.string().min(1).max(120).optional(),
  conversationId: z.string().min(1).max(120).optional(),
  locale: z.string().min(2).max(20).optional(),
  clientContext: clientContextZ,
})

@ApiTags('Admin / AI Assistant')
@ApiCookieAuth('session')
@Controller('admin/api/ai-assistant')
@UseGuards(ModernAdminAuthGuard)
export class AiAssistantController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Get('settings')
  async getSettings(@Req() req: AdminRequest): Promise<AiAssistantPublicSettings> {
    return this.aiAssistantService.getSettings(req.currentAdmin)
  }

  @Put('settings')
  async updateSettings(
    @Body() body: Record<string, unknown>,
    @Req() req: AdminRequest,
  ): Promise<AiAssistantPublicSettings> {
    const parsed = settingsBodyZ.parse(body)
    return this.aiAssistantService.updateSettings(parsed, req.currentAdmin)
  }

  @Post('chat')
  async chat(
    @Body() body: Record<string, unknown>,
    @Req() req: AdminRequest,
  ): Promise<{ taskId: string; status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' }> {
    const parsed = chatBodyZ.parse(body)
    return this.aiAssistantService.enqueueChat(
      parsed.messages,
      req.currentAdmin,
      parsed.requestId,
      parsed.locale,
      parsed.conversationId,
      parsed.clientContext,
    )
  }

  @Get('chats')
  async listChats(
    @Req() req: AdminRequest,
  ): Promise<Awaited<ReturnType<AiAssistantService['listChatHistory']>>> {
    return this.aiAssistantService.listChatHistory(req.currentAdmin)
  }

  @Get('tasks/:taskId')
  async getTask(
    @Param('taskId') taskId: string,
    @Req() req: AdminRequest,
  ): Promise<Awaited<ReturnType<AiAssistantService['getTask']>>> {
    return this.aiAssistantService.getTask(taskId, req.currentAdmin)
  }
}
