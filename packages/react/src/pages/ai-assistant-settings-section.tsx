import * as React from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Badge, Button, Input, Label, Switch, Textarea, } from '@modern-admin/ui'
import { Bot, KeyRound, Save } from 'lucide-react'
import { useAdminClient } from '../provider.js'
import { useNotify } from '../notify.js'
import { useI18n } from '../i18n.js'
import type { AiAssistantSettings } from '../client.js'
import { SettingsCard } from './settings-shared.js'

export function AiAssistantSettingsSection(): React.ReactElement {
  const client = useAdminClient()
  const notify = useNotify()
  const {t} = useI18n()
  const settings = useQuery({
    queryKey: ['modern-admin', 'ai-assistant', 'settings'],
    queryFn: () => client.getAiAssistantSettings(),
  })
  const [form, setForm] = React.useState({
    enabled: true,
    model: 'google/gemini-3.1-flash-lite-preview',
    apiKey: '',
    systemPrompt: '',
  })

  React.useEffect(() => {
    if (!settings.data) return
    setForm({
      enabled: settings.data.enabled,
      model: settings.data.model,
      apiKey: '',
      systemPrompt: settings.data.systemPrompt,
    })
  }, [settings.data])

  const save = useMutation({
    mutationFn: async (): Promise<AiAssistantSettings> =>
      client.updateAiAssistantSettings({
        enabled: form.enabled,
        model: form.model,
        ...(form.apiKey.trim() ? {apiKey: form.apiKey.trim()} : {}),
        systemPrompt: form.systemPrompt,
      }),
    onSuccess: () => {
      settings.refetch()
      setForm((prev) => ({...prev, apiKey: ''}))
      notify.success({message: t('aiAssistant:settings.saved')})
    },
    onError: (err) => {
      notify.error({message: err instanceof Error ? err.message : String(err)})
    },
  })

  if (settings.isLoading) {
    return <div className="py-8 text-sm text-muted-foreground">{t('common:loading')}</div>
  }

  if (settings.error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        {settings.error instanceof Error ? settings.error.message : String(settings.error)}
      </div>
    )
  }

  const data = settings.data
  if (!data) {
    return <div className="py-8 text-sm text-muted-foreground">{t('aiAssistant:settings.empty')}</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard
        icon={Bot}
        title={t('aiAssistant:settings.title')}
        description={t('aiAssistant:settings.description')}
        bodyClassName="space-y-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={data.enabled ? 'secondary' : 'outline'}>
            {data.enabled ? t('aiAssistant:settings.enabled') : t('aiAssistant:settings.disabled')}
          </Badge>
          <Badge variant={data.configured ? 'secondary' : 'outline'}>
            {data.configured ? t('aiAssistant:settings.configured') : t('aiAssistant:settings.apiKeyRequired')}
          </Badge>
          <Badge variant="outline">{t('aiAssistant:settings.readOnly')}</Badge>
          <Badge variant="outline">{t('aiAssistant:settings.provider', {provider: data.provider})}</Badge>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-1">
              <Label htmlFor="ai-assistant-enabled">{t('aiAssistant:settings.enableLabel')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('aiAssistant:settings.enableHint')}
              </p>
            </div>
            <Switch
              id="ai-assistant-enabled"
              checked={form.enabled}
              disabled={!data.canManage || save.isPending}
              onCheckedChange={(enabled) => setForm((prev) => ({...prev, enabled}))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-assistant-model">{t('aiAssistant:settings.modelLabel')}</Label>
            <Input
              id="ai-assistant-model"
              value={form.model}
              disabled={!data.canManage || save.isPending}
              onChange={(e) => setForm((prev) => ({...prev, model: e.target.value}))}
              placeholder="google/gemini-3.1-flash-lite-preview"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ai-assistant-api-key" className="flex items-center gap-2">
            <KeyRound className="size-4"/>
            {t('aiAssistant:settings.apiKeyLabel')}
          </Label>
          <Input
            id="ai-assistant-api-key"
            type="password"
            value={form.apiKey}
            disabled={!data.canManage || save.isPending}
            onChange={(e) => setForm((prev) => ({...prev, apiKey: e.target.value}))}
            placeholder={data.maskedApiKey ?? 'sk-or-v1-...'}
          />
          <p className="text-xs text-muted-foreground">
            {t('aiAssistant:settings.apiKeyHint')}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ai-assistant-system-prompt">{t('aiAssistant:settings.systemPromptLabel')}</Label>
          <Textarea
            id="ai-assistant-system-prompt"
            value={form.systemPrompt}
            disabled={!data.canManage || save.isPending}
            onChange={(e) => setForm((prev) => ({...prev, systemPrompt: e.target.value}))}
            rows={8}
            placeholder={t('aiAssistant:settings.systemPromptPlaceholder')}
          />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
          <div>
            <div className="font-medium">{t('aiAssistant:settings.accessTitle')}</div>
            <div className="text-muted-foreground">
              {t('aiAssistant:settings.accessDescription')}
            </div>
          </div>
          <Badge variant="outline">{t('aiAssistant:settings.futureToolsReady')}</Badge>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={!data.canManage || save.isPending || !form.model.trim()}>
            <Save className="size-4"/>
            {save.isPending ? t('aiAssistant:settings.saving') : t('aiAssistant:settings.save')}
          </Button>
        </div>
      </SettingsCard>
    </div>
  )
}
