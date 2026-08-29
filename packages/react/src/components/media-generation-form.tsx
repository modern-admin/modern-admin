import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  estimateMediaGenerationPrice,
  uuidv7,
  type MediaGenerationCatalogModel,
  type MediaGenerationCatalogParam,
  type MediaGenerationFileType,
} from '@modern-admin/core'
import {
  Badge,
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@modern-admin/ui'
import { Download, Loader2, RefreshCw, Sparkles, Square, Upload } from 'lucide-react'
import type { ActionComponentProps } from '../types.js'
import { parseApiError, type MediaGenerationTask } from '../client.js'
import { useAdminClient } from '../provider.js'
import { useFeatures } from '../hooks.js'
import { useI18n } from '../i18n.js'
import { useNotify } from '../notify.js'
import { createSocketRealtimeSubscriber } from '../realtime-socket.js'

export interface MediaGenerationFormProps {
  initialPrompt?: string
  defaultModel?: string
  mediaTypes?: MediaGenerationFileType[]
  target?: { resourceId: string; recordId: string; actionName: string }
  onApplied?: () => void
}

// Radix `Select` forbids an empty-string item value, so an optional param's
// "unset" choice rides a sentinel that maps back to '' on change.
const NO_VALUE = '__none__'

const terminal = (task: MediaGenerationTask | undefined): boolean =>
  Boolean(task && ['succeeded', 'failed', 'cancelled'].includes(task.status))

const displayValue = (value: unknown): string => {
  if (Array.isArray(value)) return value.join('\n')
  if (value === null || value === undefined) return ''
  return String(value)
}

const parseFieldValue = (param: MediaGenerationCatalogParam, value: unknown): unknown => {
  if (param.kind === 'boolean') return Boolean(value)
  const raw = displayValue(value).trim()
  if (!raw) return undefined
  const values = param.isArray
    ? raw
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [raw]
  const parsed = param.kind === 'number' ? values.map(Number) : values
  return param.isArray ? parsed : parsed[0]
}

const initialValues = (
  model: MediaGenerationCatalogModel | undefined,
  prompt: string,
): Record<string, unknown> => {
  const values: Record<string, unknown> = {}
  for (const param of model?.params ?? []) {
    if (param.default !== undefined) values[param.name] = param.default
    if (param.isPrompt && prompt) values[param.name] = prompt
  }
  if (model && !model.params.some((param) => param.isPrompt) && prompt) values.prompt = prompt
  return values
}

export function MediaGenerationForm({
  initialPrompt = '',
  defaultModel,
  mediaTypes = ['image', 'video'],
  target,
  onApplied,
}: MediaGenerationFormProps): React.ReactElement {
  const client = useAdminClient()
  const features = useFeatures()
  const queryClient = useQueryClient()
  const notify = useNotify()
  const { t } = useI18n()
  const [modelId, setModelId] = React.useState(defaultModel ?? '')
  const [values, setValues] = React.useState<Record<string, unknown>>({})
  const [taskId, setTaskId] = React.useState<string | null>(null)
  const [selectedFile, setSelectedFile] = React.useState(0)
  const [confirmed, setConfirmed] = React.useState(false)
  const [replaceExisting, setReplaceExisting] = React.useState(false)

  const catalog = useQuery({
    queryKey: ['modern-admin', 'media-generation', 'catalog'],
    queryFn: () => client.getMediaGenerationCatalog(),
  })
  const models = React.useMemo(() => {
    const allowed = new Set(mediaTypes)
    return (catalog.data ?? []).filter((model) => allowed.has(model.type))
  }, [catalog.data, mediaTypes])
  const model = models.find((candidate) => candidate.id === modelId)
  const estimatedPrice = React.useMemo(() => {
    if (!model) return null
    const price = estimateMediaGenerationPrice(model, values)
    return price === null ? null : String(Math.round(price * 1_000_000) / 1_000_000)
  }, [model, values])

  React.useEffect(() => {
    if (modelId && models.some((candidate) => candidate.id === modelId)) return
    const next = models.find((candidate) => candidate.id === defaultModel) ?? models[0]
    if (next) setModelId(next.id)
  }, [defaultModel, modelId, models])

  React.useEffect(() => {
    setValues(initialValues(model, initialPrompt))
  }, [initialPrompt, model])

  const task = useQuery({
    queryKey: ['modern-admin', 'media-generation', 'task', taskId],
    queryFn: () => client.getMediaGenerationTask(taskId!),
    enabled: Boolean(taskId),
    refetchInterval: (query) => (terminal(query.state.data) ? false : 5_000),
  })

  React.useEffect(() => {
    if (!taskId || !features.realtime) return
    const subscribe = createSocketRealtimeSubscriber({ baseUrl: client.apiBaseUrl })
    return subscribe((event) => {
      if (event.kind !== 'taskUpdated' || event.taskId !== taskId) return
      void queryClient.invalidateQueries({
        queryKey: ['modern-admin', 'media-generation', 'task', taskId],
      })
    })
  }, [client, features.realtime, queryClient, taskId])

  const create = useMutation({
    mutationFn: async () => {
      if (!model) throw new Error(t('mediaGeneration:error.modelRequired'))
      const input: Record<string, unknown> = {}
      const params =
        model.params.length > 0
          ? model.params
          : [
              {
                name: 'prompt',
                label: 'Prompt',
                kind: 'string',
                isArray: false,
                required: true,
                isMedia: false,
                isPrompt: true,
                multiline: true,
                deprecated: false,
              } satisfies MediaGenerationCatalogParam,
            ]
      for (const param of params) {
        const value = parseFieldValue(param, values[param.name])
        if (value !== undefined) input[param.name] = value
      }
      return client.createMediaGenerationTask({
        requestId: uuidv7(),
        model: model.id,
        input,
        ...(target ?? {}),
      })
    },
    onSuccess: (created) => {
      setTaskId(created.id)
      setSelectedFile(0)
      notify.success({ message: t('mediaGeneration:task.submitted') })
    },
    onError: (error) => notify.error({ message: parseApiError(error).message }),
  })

  const cancel = useMutation({
    mutationFn: () => client.cancelMediaGenerationTask(taskId!),
    onSuccess: (cancelled) =>
      queryClient.setQueryData(['modern-admin', 'media-generation', 'task', taskId], cancelled),
  })

  const apply = useMutation({
    mutationFn: () =>
      client.applyMediaGenerationTask(taskId!, {
        fileIndex: selectedFile,
        replaceExisting,
      }),
    onSuccess: (applied) => {
      queryClient.setQueryData(['modern-admin', 'media-generation', 'task', taskId], applied)
      notify.success({ message: t('mediaGeneration:apply.success') })
      onApplied?.()
    },
    onError: (error) => notify.error({ message: parseApiError(error).message }),
  })

  const currentTask = task.data
  const files = currentTask?.output?.files ?? []
  const renderParams = model?.params.length
    ? model.params.filter((param) => !param.deprecated)
    : [
        {
          name: 'prompt',
          label: t('mediaGeneration:field.prompt'),
          kind: 'string',
          isArray: false,
          required: true,
          isMedia: false,
          isPrompt: true,
          multiline: true,
          deprecated: false,
        } satisfies MediaGenerationCatalogParam,
      ]

  if (catalog.isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t('common:loading')}
      </div>
    )
  }
  if (catalog.error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
        {parseApiError(catalog.error).message}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="media-generation-model">{t('mediaGeneration:field.model')}</Label>
        <Select
          value={modelId}
          disabled={create.isPending || Boolean(taskId && !terminal(currentTask))}
          onValueChange={setModelId}
        >
          <SelectTrigger id="media-generation-model" className="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {models.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.name}
                {candidate.priceFrom ? ` · $${candidate.priceFrom}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {model?.description && <p className="text-xs text-muted-foreground">{model.description}</p>}
        {estimatedPrice && (
          <p className="text-xs font-medium text-muted-foreground">
            {t('mediaGeneration:estimatedCost', { price: estimatedPrice })}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {renderParams.map((param) => (
          <DynamicParam
            key={param.name}
            param={param}
            value={values[param.name]}
            disabled={create.isPending || Boolean(taskId && !terminal(currentTask))}
            onChange={(value) => setValues((current) => ({ ...current, [param.name]: value }))}
          />
        ))}
      </div>

      {!taskId && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(value) => setConfirmed(value === true)}
            />
            <span>{t('mediaGeneration:confirm.cost')}</span>
          </label>
          <div className="flex justify-end">
            <Button
              disabled={!model || !confirmed || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {t('mediaGeneration:create')}
            </Button>
          </div>
        </div>
      )}

      {taskId && (
        <div className="space-y-4 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant={currentTask?.status === 'succeeded' ? 'secondary' : 'outline'}>
                {t(`mediaGeneration:status.${currentTask?.status ?? 'pending'}`)}
              </Badge>
              {currentTask?.progress != null && (
                <span className="text-xs text-muted-foreground">{currentTask.progress}%</span>
              )}
            </div>
            <div className="flex gap-2">
              {!terminal(currentTask) && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate()}
                >
                  <Square className="size-3" />
                  {t('mediaGeneration:cancel')}
                </Button>
              )}
              {terminal(currentTask) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTaskId(null)
                    setConfirmed(false)
                  }}
                >
                  <RefreshCw className="size-3" />
                  {t('mediaGeneration:again')}
                </Button>
              )}
            </div>
          </div>

          {currentTask?.error && <p className="text-sm text-destructive">{currentTask.error}</p>}

          {files.length > 0 && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {files.map((file, index) => (
                  <button
                    type="button"
                    key={`${file.url}-${index}`}
                    className={`overflow-hidden rounded-lg border text-left ${selectedFile === index ? 'ring-2 ring-primary' : ''}`}
                    onClick={() => setSelectedFile(index)}
                  >
                    {file.type === 'image' ? (
                      <img
                        src={file.url}
                        alt={t('mediaGeneration:preview.alt', { index: index + 1 })}
                        className="aspect-video w-full object-contain bg-muted"
                      />
                    ) : file.type === 'video' ? (
                      <video src={file.url} controls className="aspect-video w-full bg-black" />
                    ) : (
                      <audio src={file.url} controls className="w-full p-3" />
                    )}
                    <span className="block truncate px-3 py-2 text-xs text-muted-foreground">
                      {t('mediaGeneration:preview.variant', { index: index + 1 })}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('mediaGeneration:preview.retention')}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                {target ? (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={replaceExisting}
                      onCheckedChange={(value) => setReplaceExisting(value === true)}
                    />
                    {t('mediaGeneration:apply.replace')}
                  </label>
                ) : (
                  <span />
                )}
                {target ? (
                  <Button
                    disabled={apply.isPending || Boolean(currentTask?.output?.applied)}
                    onClick={() => apply.mutate()}
                  >
                    {apply.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Upload className="size-4" />
                    )}
                    {currentTask?.output?.applied
                      ? t('mediaGeneration:apply.applied')
                      : t('mediaGeneration:apply.button')}
                  </Button>
                ) : (
                  <Button asChild variant="outline">
                    <a href={files[selectedFile]?.url} target="_blank" rel="noreferrer">
                      <Download className="size-4" />
                      {t('mediaGeneration:download')}
                    </a>
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function DynamicParam({
  param,
  value,
  disabled,
  onChange,
}: {
  param: MediaGenerationCatalogParam
  value: unknown
  disabled: boolean
  onChange(value: unknown): void
}): React.ReactElement {
  const { t } = useI18n()
  const id = `media-generation-${param.name}`
  const fullWidth = param.multiline || param.isPrompt || param.isMedia
  return (
    <div className={`space-y-1.5 ${fullWidth ? 'sm:col-span-2' : ''}`}>
      <Label htmlFor={id}>
        {param.label}
        {param.required ? ' *' : ''}
      </Label>
      {param.kind === 'boolean' ? (
        <div className="flex h-10 items-center">
          <Checkbox
            id={id}
            checked={Boolean(value)}
            disabled={disabled}
            onCheckedChange={(checked) => onChange(checked === true)}
          />
        </div>
      ) : param.options?.length ? (
        <Select
          value={displayValue(value) || (param.required ? undefined : NO_VALUE)}
          disabled={disabled}
          onValueChange={(next) => onChange(next === NO_VALUE ? '' : next)}
        >
          <SelectTrigger id={id} className="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {!param.required && <SelectItem value={NO_VALUE}>{t('common:none')}</SelectItem>}
            {param.options.map((option) => (
              <SelectItem key={String(option.value)} value={String(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : param.multiline || param.isPrompt || param.isArray ? (
        <Textarea
          id={id}
          rows={param.isPrompt ? 5 : 3}
          value={displayValue(value)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          type={param.kind === 'number' ? 'number' : 'text'}
          min={param.minimum}
          max={param.maximum}
          value={displayValue(value)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {param.description && <p className="text-xs text-muted-foreground">{param.description}</p>}
      {param.isArray && (
        <p className="text-xs text-muted-foreground">{t('mediaGeneration:field.arrayHint')}</p>
      )}
    </div>
  )
}

export function MediaGenerationAction(props: ActionComponentProps): React.ReactElement {
  const { t } = useI18n()
  const context = props.data?.mediaGeneration as
    | {
        suggestedPrompt?: string
        defaultModel?: string
        mediaTypes?: MediaGenerationFileType[]
      }
    | undefined
  if (!props.recordId)
    return <p className="text-sm text-destructive">{t('mediaGeneration:error.recordRequired')}</p>
  return (
    <MediaGenerationForm
      initialPrompt={context?.suggestedPrompt}
      defaultModel={context?.defaultModel}
      mediaTypes={context?.mediaTypes}
      target={{
        resourceId: props.resourceId,
        recordId: props.recordId,
        actionName: props.action.name,
      }}
      onApplied={props.close}
    />
  )
}
