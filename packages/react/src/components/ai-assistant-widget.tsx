import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  RichtextRender,
  ScrollArea,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Textarea,
} from '@modern-admin/ui'
import { Bot, History, Loader2, MessageSquare, Plus, Send, Settings, X } from 'lucide-react'
import { uuidv7 } from '@modern-admin/core'
import { useAdminClient } from '../provider.js'
import { useFeatures } from '../hooks.js'
import { useNotify } from '../notify.js'
import { useBasepath, useNavigate } from '../router.js'
import { useI18n } from '../i18n.js'
import type {
  AiAssistantChatHistoryItem,
  AiAssistantChatMessage,
  AiAssistantCitation,
  AiAssistantTask,
  AiUiAction,
} from '../client.js'
import { emitDashboardReload } from '../use-dashboard-charts.js'

interface ChatItem {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: AiAssistantCitation[]
}

interface QueuedItem {
  id: string
  content: string
}

const randomId = (): string => uuidv7()

const MAX_QUEUE = 5

const messagesFromTask = (task: AiAssistantTask, fallbackText: string): ChatItem[] => {
  const inputMessages = Array.isArray(task.input?.messages)
    ? task.input.messages as AiAssistantChatMessage[]
    : []
  const items: ChatItem[] = inputMessages.map((message, index) => ({
    id: `${task.id}-input-${index}`,
    role: message.role,
    content: message.content,
  }))
  if (task.output) {
    const text = String(task.output.text ?? '').trim()
    items.push({
      id: `task-${task.id}`,
      role: 'assistant',
      content: text || fallbackText,
      citations: Array.isArray(task.output.citations) ? task.output.citations : undefined,
    })
  }
  return items
}

export function AiAssistantWidget(): React.ReactElement | null {
  const client = useAdminClient()
  const queryClient = useQueryClient()
  const notify = useNotify()
  const navigate = useNavigate()
  const basepath = useBasepath()
  const { locale, t } = useI18n()
  const [open, setOpen] = React.useState(false)
  const [input, setInput] = React.useState('')
  const [messages, setMessages] = React.useState<ChatItem[]>([])
  const [conversationId, setConversationId] = React.useState(() => randomId())
  const [activeTaskId, setActiveTaskId] = React.useState<string | null>(null)
  const [queue, setQueue] = React.useState<QueuedItem[]>([])

  // Capability gate: when the host hasn't wired `aiAssistant` in
  // `ModernAdminModule.forRoot`, the `/admin/api/ai-assistant/*`
  // controllers aren't even registered — issuing the settings query would
  // 404 every page load. Skip the query, the widget, and the chat sheet
  // entirely in that case.
  const features = useFeatures()
  const aiAvailable = features.aiAssistant

  const settings = useQuery({
    queryKey: ['modern-admin', 'ai-assistant', 'settings'],
    queryFn: () => client.getAiAssistantSettings(),
    enabled: aiAvailable,
  })

  const chat = useMutation({
    mutationFn: async (input: {
      requestId: string
      conversationId: string
      messages: AiAssistantChatMessage[]
    }) => {
      // Strip the admin's basepath so the backend receives a basepath-relative
      // path (e.g. `/resources/posts/123`, not `/admin/resources/posts/123`) —
      // the grounding prompt matches against the relative `/resources/...` form.
      // Boundary-aware: only strip a full segment match so basepath `/admin`
      // never mangles an unrelated path like `/administrators`.
      let pathname = typeof window !== 'undefined' ? window.location.pathname : undefined
      if (pathname && basepath) {
        if (pathname === basepath) {
          pathname = '/'
        } else if (pathname.startsWith(`${basepath}/`)) {
          pathname = pathname.slice(basepath.length)
        }
      }
      return client.sendAiAssistantChat(
        input.messages,
        input.requestId,
        locale,
        input.conversationId,
        pathname ? { pathname } : undefined,
      )
    },
    onSuccess: (response) => {
      setActiveTaskId(response.taskId)
      void queryClient.invalidateQueries({ queryKey: ['modern-admin', 'ai-assistant', 'chats'] })
    },
    onError: (err) => {
      notify.error({ message: err instanceof Error ? err.message : String(err) })
    },
  })

  const history = useQuery<AiAssistantChatHistoryItem[]>({
    queryKey: ['modern-admin', 'ai-assistant', 'chats'],
    queryFn: () => client.listAiAssistantChats(),
    enabled: aiAvailable && open && settings.data?.configured === true,
  })

  const task = useQuery<AiAssistantTask>({
    queryKey: ['modern-admin', 'ai-assistant', 'task', activeTaskId],
    queryFn: () => client.getAiAssistantTask(activeTaskId!),
    enabled: !!activeTaskId,
    refetchInterval: (query) => {
      const state = query.state.data?.status
      return state === 'pending' || state === 'running' ? 1200 : false
    },
  })

  React.useEffect(() => {
    const data = task.data
    if (!data || !activeTaskId) return
    if (data.status === 'succeeded' && data.output != null) {
      setMessages((prev) => {
        const alreadyExists = prev.some((item) => item.id === `task-${data.id}`)
        if (alreadyExists) return prev
        const text = String(data.output?.text ?? '').trim()
        return [
          ...prev,
          {
            id: `task-${data.id}`,
            role: 'assistant',
            content: text || t('aiAssistant:noText'),
            citations: Array.isArray(data.output?.citations) ? data.output.citations : undefined,
          },
        ]
      })
      setActiveTaskId(null)
      void queryClient.invalidateQueries({ queryKey: ['modern-admin', 'ai-assistant', 'chats'] })
      const uiActions = Array.isArray(data.output?.uiActions)
        ? (data.output.uiActions as AiUiAction[])
        : []
      for (const action of uiActions) {
        if (action.kind === 'refresh' && action.target === 'dashboard') {
          emitDashboardReload()
          continue
        }
        if (action.kind === 'navigate') {
          setOpen(false)
          navigate(action.route)
        }
      }
      return
    }
    if (data.status === 'failed' || data.status === 'cancelled') {
      notify.error({ message: data.error ?? t('aiAssistant:taskFailed') })
      setActiveTaskId(null)
    }
  }, [activeTaskId, navigate, notify, queryClient, task.data, t])

  // Send a user message immediately (assumes nothing is in flight).
  const sendChat = React.useCallback(
    (content: string): void => {
      const userMsg: ChatItem = { id: randomId(), role: 'user', content }
      const updated = [...messages, userMsg]
      setMessages(updated)
      chat.mutate({
        requestId: userMsg.id,
        conversationId,
        messages: updated.map((m) => ({ role: m.role, content: m.content })),
      })
    },
    [chat, conversationId, messages],
  )

  const startNewChat = React.useCallback((): void => {
    setConversationId(randomId())
    setMessages([])
    setInput('')
    setQueue([])
    setActiveTaskId(null)
  }, [])

  const selectChat = React.useCallback(
    async (item: AiAssistantChatHistoryItem): Promise<void> => {
      try {
        const selected = await client.getAiAssistantTask(item.taskId)
        setConversationId(item.conversationId)
        setMessages(messagesFromTask(selected, t('aiAssistant:noText')))
        setQueue([])
        setInput('')
        setActiveTaskId(
          selected.status === 'pending' || selected.status === 'running' ? selected.id : null,
        )
      } catch (err) {
        notify.error({ message: err instanceof Error ? err.message : String(err) })
      }
    },
    [client, notify, t],
  )

  // Auto-dequeue: when nothing is in flight and queue has items, send the head.
  React.useEffect(() => {
    if (activeTaskId !== null) return
    if (chat.isPending) return
    const next = queue[0]
    if (!next) return
    setQueue((q) => q.slice(1))
    sendChat(next.content)
  }, [activeTaskId, chat.isPending, queue, sendChat])

  if (!aiAvailable) return null
  if (settings.isLoading) return null
  if (settings.error) return null
  if (!settings.data?.enabled) return null
  if (!settings.data.canChat) return null

  const isProcessing = chat.isPending || activeTaskId != null
  const queueFull = queue.length >= MAX_QUEUE

  const submit = (): void => {
    const text = input.trim()
    if (!text) return
    if (isProcessing) {
      if (queueFull) return
      setQueue((q) => [...q, { id: randomId(), content: text }])
      setInput('')
      return
    }
    setInput('')
    sendChat(text)
  }

  const configured = settings.data.configured
  const isThinking =
    isProcessing ||
    task.data?.status === 'running' ||
    task.data?.status === 'pending'
  const progress = typeof task.data?.progress === 'number' ? task.data.progress : null
  const sendDisabled = input.trim().length === 0 || (isProcessing && queueFull)

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40">
        <Button
          onClick={() => setOpen(true)}
          aria-label={t('aiAssistant:fab.label')}
          className={
            'group h-10 min-w-10 max-w-10 rounded-full pl-3 pr-3 shadow-lg ' +
            'justify-end gap-0 overflow-hidden opacity-70 hover:opacity-100 ' +
            'transition-[max-width,padding-left,opacity] duration-200 ease-in-out ' +
            'hover:max-w-36 hover:pl-4'
          }
        >
          <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium transition-[max-width,padding-right] duration-200 ease-in-out group-hover:max-w-[5rem] group-hover:pr-2">
            {t('aiAssistant:fab.short')}
          </span>
          <MessageSquare className="size-4 shrink-0" />
        </Button>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent hideCloseButton className="flex w-full flex-col gap-0 sm:max-w-xl">
          <SheetHeader className="border-b border-border pb-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <SheetTitle className="flex items-center gap-2">
                  <Bot className="size-5" />
                  {t('aiAssistant:title')}
                </SheetTitle>
                <SheetDescription>{t('aiAssistant:description')}</SheetDescription>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {configured && (
                  <>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t('aiAssistant:history')}
                        >
                          <History className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-72">
                        <DropdownMenuLabel>{t('aiAssistant:history')}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {history.isLoading && (
                          <DropdownMenuItem disabled>{t('common:loading')}</DropdownMenuItem>
                        )}
                        {!history.isLoading && (history.data?.length ?? 0) === 0 && (
                          <DropdownMenuItem disabled>{t('aiAssistant:history.empty')}</DropdownMenuItem>
                        )}
                        {history.data?.map((item) => (
                          <DropdownMenuItem
                            key={item.conversationId}
                            className="flex-col items-start gap-0 py-2"
                            onSelect={() => {
                              void selectChat(item)
                            }}
                          >
                            <span className="line-clamp-1 w-full text-sm font-medium">{item.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {new Intl.DateTimeFormat(locale, {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              }).format(new Date(item.updatedAt))}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={startNewChat}
                      aria-label={t('aiAssistant:newChat')}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </>
                )}
                <SheetClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('common:close')}
                  >
                    <X className="size-4" />
                  </Button>
                </SheetClose>
              </div>
            </div>
          </SheetHeader>

          {!configured ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
              <div className="space-y-2">
                <div className="text-lg font-semibold">
                  {t('aiAssistant:notConfigured.title')}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t('aiAssistant:notConfigured.description')}
                </div>
              </div>
              {settings.data.canManage && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpen(false)
                    navigate({ name: 'settings', section: 'ai-assistant' })
                  }}
                >
                  <Settings className="size-4" />
                  {t('aiAssistant:notConfigured.openSettings')}
                </Button>
              )}
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1 px-4 py-4">
                <div className="space-y-3">
                  {messages.length === 0 && (
                    <Card>
                      <CardContent className="space-y-2 p-4 text-sm text-muted-foreground">
                        <div className="font-medium text-foreground">
                          {t('aiAssistant:tryAsking')}
                        </div>
                        <div>- {t('aiAssistant:tryAsking.example1')}</div>
                        <div>- {t('aiAssistant:tryAsking.example2')}</div>
                        <div>- {t('aiAssistant:tryAsking.example3')}</div>
                      </CardContent>
                    </Card>
                  )}
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                    >
                      <div
                        className={message.role === 'user'
                          ? 'max-w-[85%] rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground'
                          : 'max-w-[85%] rounded-2xl border bg-card px-4 py-3 text-sm'}
                      >
                        {message.role === 'assistant' ? (
                          <RichtextRender
                            value={message.content}
                            format="markdown"
                            className="text-sm [&_pre]:overflow-x-auto [&_pre]:text-xs"
                          />
                        ) : (
                          <div className="whitespace-pre-wrap">{message.content}</div>
                        )}
                        {message.citations && message.citations.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {message.citations.slice(0, 6).map((citation, index) => {
                              const label = `${citation.resourceId}${citation.recordId ? `#${citation.recordId}` : ''}`
                              const key = `${citation.resourceId}-${citation.recordId ?? 'resource'}-${index}`
                              if (citation.recordId) {
                                return (
                                  <button
                                    key={key}
                                    type="button"
                                    className="cursor-pointer"
                                    onClick={() => {
                                      setOpen(false)
                                      navigate({
                                        name: 'show',
                                        resourceId: citation.resourceId,
                                        recordId: citation.recordId!,
                                      })
                                    }}
                                  >
                                    <Badge variant="outline">{label}</Badge>
                                  </button>
                                )
                              }
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  className="cursor-pointer"
                                  onClick={() => {
                                    setOpen(false)
                                    navigate({ name: 'list', resourceId: citation.resourceId })
                                  }}
                                >
                                  <Badge variant="outline">{label}</Badge>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {isThinking && (
                    <div className="flex justify-start">
                      <div className="inline-flex items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        {progress != null
                          ? t('aiAssistant:thinkingProgress', { progress })
                          : t('aiAssistant:thinking')}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="border-t border-border bg-background/95 px-3 py-2">
                {queue.length > 0 && (
                  <div className="mb-2 space-y-1">
                    {queue.map((item, index) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1 text-sm"
                      >
                        <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                          ({index + 1})
                        </span>
                        <span className="flex-1 truncate" title={item.content}>
                          {item.content}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6 shrink-0"
                          onClick={() =>
                            setQueue((q) => q.filter((entry) => entry.id !== item.id))
                          }
                          aria-label={t('aiAssistant:queue.cancel')}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    submit()
                  }}
                >
                  <div className="flex items-center gap-1">
                    <Textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault()
                          submit()
                        }
                      }}
                      rows={1}
                      placeholder={t('aiAssistant:input.placeholder')}
                      aria-label={t('aiAssistant:input.placeholder')}
                      className={
                        'flex-1 max-h-[10rem] min-h-0 resize-none border-0 bg-transparent px-1 py-2 ' +
                        'text-sm shadow-none outline-none [field-sizing:content] ' +
                        'focus-visible:ring-0 focus-visible:ring-offset-0'
                      }
                    />
                    <Button
                      type="submit"
                      disabled={sendDisabled}
                      aria-label={t('aiAssistant:send')}
                      className="size-8 shrink-0 rounded-full p-0"
                    >
                      <Send className="size-4" />
                    </Button>
                  </div>
                  <p className="px-1 pb-1 text-xs text-muted-foreground">
                    {t('aiAssistant:input.hint')}
                  </p>
                </form>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
