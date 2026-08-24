import * as React from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Badge, Button, Input, Label, Switch } from '@modern-admin/ui'
import { ExternalLink, Image, KeyRound, Save } from 'lucide-react'
import { useAdminClient } from '../provider.js'
import { useI18n } from '../i18n.js'
import { useNotify } from '../notify.js'
import { SettingsCard } from './settings-shared.js'
import { MediaGenerationForm } from '../components/media-generation-form.js'

export function MediaGenerationSettingsSection(): React.ReactElement {
  const client = useAdminClient()
  const { t } = useI18n()
  const notify = useNotify()
  const settings = useQuery({
    queryKey: ['modern-admin', 'media-generation', 'settings'],
    queryFn: () => client.getMediaGenerationSettings(),
  })
  const [enabled, setEnabled] = React.useState(true)
  const [apiKey, setApiKey] = React.useState('')

  React.useEffect(() => {
    if (settings.data) setEnabled(settings.data.enabled)
  }, [settings.data])

  const save = useMutation({
    mutationFn: () => client.updateMediaGenerationSettings({
      enabled,
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    }),
    onSuccess: () => {
      setApiKey('')
      void settings.refetch()
      notify.success({ message: t('mediaGeneration:settings.saved') })
    },
    onError: (error) => notify.error({
      message: error instanceof Error ? error.message : String(error),
    }),
  })

  if (settings.isLoading) return <p className="py-8 text-sm text-muted-foreground">{t('common:loading')}</p>
  if (settings.error) return <p className="text-sm text-destructive">{settings.error instanceof Error ? settings.error.message : String(settings.error)}</p>
  const data = settings.data
  if (!data) return <p className="text-sm text-muted-foreground">{t('mediaGeneration:settings.empty')}</p>

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard icon={Image} title={t('mediaGeneration:settings.title')} description={t('mediaGeneration:settings.description')} bodyClassName="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant={data.enabled ? 'secondary' : 'outline'}>{data.enabled ? t('mediaGeneration:settings.enabled') : t('mediaGeneration:settings.disabled')}</Badge>
          <Badge variant={data.configured ? 'secondary' : 'outline'}>{data.configured ? t('mediaGeneration:settings.configured') : t('mediaGeneration:settings.apiKeyRequired')}</Badge>
          <Badge variant="outline">{data.providerName}</Badge>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div><Label htmlFor="media-generation-enabled">{t('mediaGeneration:settings.enableLabel')}</Label><p className="text-xs text-muted-foreground">{t('mediaGeneration:settings.enableHint')}</p></div>
          <Switch id="media-generation-enabled" checked={enabled} disabled={!data.canManage || save.isPending} onCheckedChange={setEnabled} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="media-generation-api-key" className="flex items-center gap-2"><KeyRound className="size-4" />{t('mediaGeneration:settings.apiKeyLabel')}</Label>
          <Input id="media-generation-api-key" type="password" value={apiKey} disabled={!data.canManage || save.isPending} placeholder={data.maskedApiKey ?? t('mediaGeneration:settings.apiKeyPlaceholder')} onChange={(event) => setApiKey(event.target.value)} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{t('mediaGeneration:settings.apiKeyHint')}</span>
            {data.apiKeyUrl && <a href={data.apiKeyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">{t('mediaGeneration:settings.createApiKey')}<ExternalLink className="size-3" /></a>}
          </div>
        </div>
        <div className="flex justify-end"><Button disabled={!data.canManage || save.isPending} onClick={() => save.mutate()}><Save className="size-4" />{save.isPending ? t('common:saving') : t('common:save')}</Button></div>
      </SettingsCard>
      {data.enabled && data.configured && data.canGenerate && (
        <SettingsCard icon={Image} title={t('mediaGeneration:studio.title')} description={t('mediaGeneration:studio.description')}>
          <MediaGenerationForm />
        </SettingsCard>
      )}
    </div>
  )
}
