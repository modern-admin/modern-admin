import type { CurrentAdmin } from '@modern-admin/core'
import type { AiAssistantCitation } from './ai-assistant-tools.js'

export interface AiAssistantChatMessageInput {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Snapshot of the admin frontend at the moment the user sent the message.
 * Used by the assistant to ground itself ("user is currently viewing X")
 * and to scope refresh actions ("refresh the page they're on").
 */
export interface AiClientContext {
  /** Window path the user was on when they sent the message, e.g. "/" or "/resources/posts/abc". */
  pathname?: string
}

/**
 * Side-effect emitted by the assistant for the frontend to execute after
 * the task completes. Pure UI-layer — never mutates server data.
 */
export type AiUiAction =
  | { kind: 'navigate'; route: AiNavigateRoute }
  | { kind: 'refresh'; target: 'dashboard' }

/**
 * Allowed navigation targets. Mirrors the safe subset of the frontend
 * `Route` union (`packages/react/src/router.tsx`). `edit` / `new` are
 * intentionally excluded — the assistant is strictly read-only.
 */
export type AiNavigateRoute =
  | { name: 'home' }
  | { name: 'audit-log' }
  | { name: 'list'; resourceId: string }
  | { name: 'show'; resourceId: string; recordId: string }
  | { name: 'settings'; section?: string }

export interface AiAssistantTaskOutput {
  text: string
  citations: AiAssistantCitation[]
  toolCalls: Array<{ toolName: string }>
  /** Side-effects to apply on the frontend (navigate, refresh, ...). */
  uiActions: AiUiAction[]
  /** Allow shape to satisfy `Record<string, unknown>` consumers (task store). */
  [key: string]: unknown
}

export interface AiAssistantChatJobData {
  taskId: string
  messages: AiAssistantChatMessageInput[]
  requestId?: string
  conversationId?: string
  locale?: string
  currentAdmin?: CurrentAdmin
  clientContext?: AiClientContext
}
