// Admin Settings hub. Reachable from the user/profile dropdown menu and
// rendered by the router for `/settings/<section>`. Currently three
// sections: `api-keys`, `webhooks`, `ai-assistant`; the layout is built so
// adding more sections is just a new entry in `SECTIONS` + a switch case.

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InfoTooltip,
  Input,
  JsonEditor,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@modern-admin/ui'
import {
  AlertTriangle,
  Bot,
  Check,
  Copy,
  Edit,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  Settings as SettingsIcon,
  Trash2,
  X,
} from 'lucide-react'
import { useAdminClient } from '../provider.js'
import { useResources } from '../hooks.js'
import { useI18n } from '../i18n.js'
import { Link, useNavigate } from '../router.js'
import { useNotify } from '../notify.js'
import { useDialogs } from '../dialogs.js'
import type { ApiKeyRecord, WebhookInput, WebhookRecord } from '../client.js'
import type { ResourceJSON } from '../types.js'
import { AiAssistantSettingsSection } from './ai-assistant-settings-section.js'
import { SettingsCard, SettingsListState, SettingsTableScroll } from './settings-shared.js'

const KEY_LIST = ['modern-admin', 'api-keys'] as const
const KEY_WEBHOOKS = ['modern-admin', 'webhooks'] as const

type SectionKey = 'api-keys' | 'ai-assistant' | 'webhooks'

interface SectionDef {
  key: SectionKey
  labelKey: string
  icon: React.ComponentType<{ className?: string }>
}

const SECTIONS: SectionDef[] = [
  { key: 'api-keys', labelKey: 'settings:apiKeys.title', icon: KeyRound },
  { key: 'webhooks', labelKey: 'settings:webhooks.title', icon: SettingsIcon },
  { key: 'ai-assistant', labelKey: 'aiAssistant:title', icon: Bot },
]

export function SettingsPage({ section }: { section?: string }): React.ReactElement {
  const { t } = useI18n()
  const navigate = useNavigate()
  const active: SectionKey =
    section === 'ai-assistant' ? 'ai-assistant'
      : section === 'webhooks' ? 'webhooks'
        : 'api-keys'
  return (
    // `minmax(0,1fr)` (not bare `1fr`) lets the content column shrink below
    // its intrinsic min-width — otherwise wide tables push the whole grid
    // past the viewport at ~`md` widths (~768–900px).
    <div className="flex flex-col gap-4 md:grid md:grid-cols-[14rem_minmax(0,1fr)]">
      {/* Mobile: dropdown selector (handles many sections gracefully) */}
      <div className="md:hidden">
        <Select value={active} onValueChange={(v) => navigate({ name: 'settings', section: v as SectionKey })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SECTIONS.map(({ key, labelKey, icon: Icon }) => (
              <SelectItem key={key} value={key}>
                <span className="flex items-center gap-2">
                  <Icon className="size-4" />
                  <span>{t(labelKey)}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {/* Desktop: sidebar nav */}
      <aside className="hidden md:block">
        <nav className="flex flex-col gap-1">
          {SECTIONS.map(({ key, labelKey, icon: Icon }) => (
            <Link
              key={key}
              to={{ name: 'settings', section: key }}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent',
                active === key && 'bg-accent font-medium',
              )}
            >
              <Icon className="size-4" />
              <span>{t(labelKey)}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <section className="min-w-0">
        {active === 'api-keys' && <ApiKeysSection />}
        {active === 'webhooks' && <WebhooksSection />}
        {active === 'ai-assistant' && <AiAssistantSettingsSection />}
      </section>
    </div>
  )
}

// ─── API Keys section ─────────────────────────────────────────────────────────

function ApiKeysSection(): React.ReactElement {
  const { t } = useI18n()
  const client = useAdminClient()
  const qc = useQueryClient()
  const notify = useNotify()
  const dialogs = useDialogs()
  const resources = useResources()
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ApiKeyRecord | null>(null)
  const [createdSecret, setCreatedSecret] = React.useState<{ key: string; record: ApiKeyRecord } | null>(null)

  const list = useQuery({
    queryKey: KEY_LIST,
    queryFn: () => client.listApiKeys(),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => client.deleteApiKey(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_LIST })
      notify.success({ key: 'settings:apiKeys.notice.revoked' })
    },
    onError: (err) => notify.error({ message: err instanceof Error ? err.message : String(err) }),
  })

  const toggleEnabledMut = useMutation({
    mutationFn: (vars: { id: string; enabled: boolean }) =>
      client.updateApiKey(vars.id, { enabled: vars.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_LIST }),
    onError: (err) => notify.error({ message: err instanceof Error ? err.message : String(err) }),
  })

  const onCreate = (): void => {
    setEditing(null)
    setEditorOpen(true)
  }

  const onEdit = (key: ApiKeyRecord): void => {
    setEditing(key)
    setEditorOpen(true)
  }

  const onRevoke = async (key: ApiKeyRecord): Promise<void> => {
    const ok = await dialogs.confirm({
      title: t('settings:apiKeys.confirmRevoke.title'),
      description: t('settings:apiKeys.confirmRevoke.description', { name: key.name ?? key.id }),
      confirmLabel: t('settings:apiKeys.actions.revoke'),
      destructive: true,
    })
    if (ok) deleteMut.mutate(key.id)
  }

  const keys = list.data?.keys ?? []

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard
        icon={KeyRound}
        title={t('settings:apiKeys.title')}
        description={t('settings:apiKeys.description')}
        action={
          <Button onClick={onCreate} size="sm">
            <Plus className="size-4" />
            <span>{t('settings:apiKeys.actions.create')}</span>
          </Button>
        }
      >
        <SettingsListState
          isLoading={list.isLoading}
          error={list.error}
          isEmpty={keys.length === 0}
          loadingLabel={t('common:loading')}
          empty={{
            icon: KeyRound,
            title: t('settings:apiKeys.empty.title'),
            description: t('settings:apiKeys.empty.description'),
          }}
        >
          <SettingsTableScroll>
            <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('settings:apiKeys.columns.name')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t('settings:apiKeys.columns.start')}</TableHead>
                    <TableHead className="hidden md:table-cell">{t('settings:apiKeys.columns.permissions')}</TableHead>
                    <TableHead className="hidden md:table-cell">{t('settings:apiKeys.columns.expiresAt')}</TableHead>
                    <TableHead>{t('settings:apiKeys.columns.enabled')}</TableHead>
                    <TableHead className="text-right">{t('settings:apiKeys.columns.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((k) => (
                    <TableRow key={k.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{k.name ?? k.id}</span>
                          {k.lastRequest && (
                            <span className="text-xs text-muted-foreground">
                              {t('settings:apiKeys.lastUsed', { date: formatDate(k.lastRequest) })}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs sm:table-cell">
                        {k.start ? `${k.start}…` : '—'}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <PermissionsSummary permissions={k.permissions} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs">
                        {k.expiresAt ? formatDate(k.expiresAt) : t('settings:apiKeys.expiresNever')}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={k.enabled}
                          onCheckedChange={(enabled) => toggleEnabledMut.mutate({ id: k.id, enabled })}
                          aria-label={t('settings:apiKeys.columns.enabled')}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => onEdit(k)} aria-label={t('settings:apiKeys.actions.edit')}>
                            <Edit className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onRevoke(k)}
                            aria-label={t('settings:apiKeys.actions.revoke')}
                            disabled={deleteMut.isPending}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
          </SettingsTableScroll>
        </SettingsListState>
      </SettingsCard>

      <ApiKeyEditorDialog
        key={editing?.id ?? 'new'}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editing}
        resources={resources}
        onCreated={(result) => {
          setEditorOpen(false)
          setCreatedSecret(result)
          qc.invalidateQueries({ queryKey: KEY_LIST })
        }}
        onUpdated={() => {
          setEditorOpen(false)
          qc.invalidateQueries({ queryKey: KEY_LIST })
        }}
      />

      <CreatedSecretDialog
        secret={createdSecret}
        onClose={() => setCreatedSecret(null)}
      />
    </div>
  )
}

// ─── Permissions matrix editor ────────────────────────────────────────────────

interface PermissionsState {
  /** resourceId -> Set<actionName>. `'*'` means all actions of that resource. */
  byResource: Record<string, Set<string>>
}

const buildState = (perms: Record<string, string[]>): PermissionsState => ({
  byResource: Object.fromEntries(
    Object.entries(perms).map(([k, v]) => [k, new Set(v)]),
  ),
})

const stateToWire = (state: PermissionsState): Record<string, string[]> => {
  const out: Record<string, string[]> = {}
  for (const [k, set] of Object.entries(state.byResource)) {
    if (set.size === 0) continue
    out[k] = Array.from(set)
  }
  return out
}

function PermissionsMatrix({
  resources,
  state,
  onChange,
}: {
  resources: ResourceJSON[]
  state: PermissionsState
  onChange: (next: PermissionsState) => void
}): React.ReactElement {
  const { t } = useI18n()

  const toggle = (resourceId: string, action: string): void => {
    const set = new Set(state.byResource[resourceId] ?? [])
    if (set.has(action)) set.delete(action)
    else set.add(action)
    onChange({ byResource: { ...state.byResource, [resourceId]: set } })
  }

  const toggleAll = (resourceId: string, actions: string[]): void => {
    const current = state.byResource[resourceId] ?? new Set<string>()
    const allSelected = actions.every((a) => current.has(a))
    const next = new Set<string>(allSelected ? [] : actions)
    onChange({ byResource: { ...state.byResource, [resourceId]: next } })
  }

  const resourcesWithActions = React.useMemo(
    () => resources.filter((r) => (r.actions ?? []).length > 0),
    [resources],
  )

  const allGloballySelected =
    resourcesWithActions.length > 0 &&
    resourcesWithActions.every((r) => {
      const actions = (r.actions ?? []).map((a) => a.name)
      const current = state.byResource[r.id] ?? new Set<string>()
      return actions.every((a) => current.has(a))
    })

  const toggleAllResources = (): void => {
    const select = !allGloballySelected
    const next: Record<string, Set<string>> = { ...state.byResource }
    for (const r of resources) {
      const actions = (r.actions ?? []).map((a) => a.name)
      next[r.id] = select ? new Set(actions) : new Set<string>()
    }
    onChange({ byResource: next })
  }

  if (resources.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t('settings:apiKeys.permissions.noResources')}</p>
    )
  }

  return (
    <div className="rounded-md border border-border">
      {resourcesWithActions.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={toggleAllResources}
          >
            {allGloballySelected ? (
              <>
                <X className="mr-1.5 size-3.5" />
                {t('settings:apiKeys.permissions.clearAllResources')}
              </>
            ) : (
              <>
                <Check className="mr-1.5 size-3.5" />
                {t('settings:apiKeys.permissions.selectAllResources')}
              </>
            )}
          </Button>
        </div>
      )}
      <div className="max-h-[24rem] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead className="w-[14rem]">{t('settings:apiKeys.permissions.resource')}</TableHead>
              <TableHead>{t('settings:apiKeys.permissions.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resources.map((r) => {
              const actions = (r.actions ?? []).map((a) => a.name)
              const current = state.byResource[r.id] ?? new Set<string>()
              const allSelected = actions.length > 0 && actions.every((a) => current.has(a))
              return (
                <TableRow key={r.id}>
                  <TableCell className="align-top">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{r.name}</span>
                      <span className="text-xs text-muted-foreground">{r.id}</span>
                      <button
                        type="button"
                        className="mt-1 inline-flex items-center gap-1 self-start text-xs text-primary hover:underline"
                        onClick={() => toggleAll(r.id, actions)}
                      >
                        {allSelected ? <X className="size-3" /> : <Check className="size-3" />}
                        {allSelected
                          ? t('settings:apiKeys.permissions.clearAll')
                          : t('settings:apiKeys.permissions.selectAll')}
                      </button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {actions.map((a) => {
                        const checked = current.has(a)
                        return (
                          <label
                            key={a}
                            className={cn(
                              'inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs',
                              checked && 'border-primary bg-primary/10 text-primary',
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggle(r.id, a)}
                              className="size-3.5"
                            />
                            <span>{a}</span>
                          </label>
                        )
                      })}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function PermissionsSummary({ permissions }: { permissions: Record<string, string[]> }): React.ReactElement {
  const { t } = useI18n()
  const entries = Object.entries(permissions)
  if (entries.length === 0) {
    return <Badge variant="outline">{t('settings:apiKeys.permissions.none')}</Badge>
  }
  const totalActions = entries.reduce((sum, [, a]) => sum + a.length, 0)
  return (
    <Badge variant="secondary">
      {t('settings:apiKeys.permissions.summary', { resources: entries.length, actions: totalActions })}
    </Badge>
  )
}

// ─── Editor dialog ────────────────────────────────────────────────────────────

function ApiKeyEditorDialog({
  open,
  onOpenChange,
  editing,
  resources,
  onCreated,
  onUpdated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: ApiKeyRecord | null
  resources: ResourceJSON[]
  onCreated: (result: { key: string; record: ApiKeyRecord }) => void
  onUpdated: (record: ApiKeyRecord) => void
}): React.ReactElement {
  const { t } = useI18n()
  const client = useAdminClient()
  const notify = useNotify()
  const isEdit = !!editing
  const [name, setName] = React.useState(editing?.name ?? '')
  const [expiresInDays, setExpiresInDays] = React.useState<string>(() => {
    if (!editing?.expiresAt) return ''
    const ms = new Date(editing.expiresAt).getTime() - Date.now()
    return ms > 0 ? String(Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)))) : ''
  })
  const [permissions, setPermissions] = React.useState<PermissionsState>(() =>
    buildState(editing?.permissions ?? {}),
  )

  const save = useMutation({
    mutationFn: async (): Promise<{ key?: string; record: ApiKeyRecord }> => {
      const wire = stateToWire(permissions)
      if (isEdit && editing) {
        const expiry = expiresInDays.trim() === '' ? null : Number(expiresInDays)
        const res = await client.updateApiKey(editing.id, {
          name: name.trim(),
          permissions: wire,
          expiresInDays: expiry === null ? null : Number.isFinite(expiry) && expiry > 0 ? expiry : undefined,
        })
        return { record: res.record }
      }
      const expiry = expiresInDays.trim() === '' ? null : Number(expiresInDays)
      return client.createApiKey({
        name: name.trim(),
        permissions: wire,
        expiresInDays: expiry === null ? null : Number.isFinite(expiry) && expiry > 0 ? expiry : undefined,
      }) as Promise<{ key: string; record: ApiKeyRecord }>
    },
    onSuccess: (result) => {
      if (isEdit) {
        notify.success({ key: 'settings:apiKeys.notice.updated' })
        onUpdated(result.record)
      } else {
        if (result.key) onCreated({ key: result.key, record: result.record })
      }
    },
    onError: (err) => notify.error({ message: err instanceof Error ? err.message : String(err) }),
  })

  // Sync state when dialog re-opens against a different record.
  React.useEffect(() => {
    if (!open) return
    setName(editing?.name ?? '')
    setPermissions(buildState(editing?.permissions ?? {}))
    if (!editing?.expiresAt) setExpiresInDays('')
    else {
      const ms = new Date(editing.expiresAt).getTime() - Date.now()
      setExpiresInDays(ms > 0 ? String(Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)))) : '')
    }
  }, [open, editing])

  const totalSelected = Object.values(permissions.byResource).reduce(
    (sum, set) => sum + (set?.size ?? 0),
    0,
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('settings:apiKeys.editor.titleEdit') : t('settings:apiKeys.editor.titleCreate')}
          </DialogTitle>
          <DialogDescription>{t('settings:apiKeys.editor.description')}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            save.mutate()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="api-key-name">{t('settings:apiKeys.editor.name')}</Label>
              <Input
                id="api-key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('settings:apiKeys.editor.namePlaceholder')}
                required
                maxLength={64}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="api-key-expires">{t('settings:apiKeys.editor.expiresInDays')}</Label>
              <Input
                id="api-key-expires"
                type="number"
                min={1}
                max={3650}
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                placeholder={t('settings:apiKeys.editor.expiresPlaceholder')}
              />
              <span className="text-xs text-muted-foreground">
                {t('settings:apiKeys.editor.expiresHint')}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>{t('settings:apiKeys.editor.permissions')}</Label>
              <span className="text-xs text-muted-foreground">
                {t('settings:apiKeys.editor.selectedActions', { count: totalSelected })}
              </span>
            </div>
            <PermissionsMatrix resources={resources} state={permissions} onChange={setPermissions} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common:cancel')}
            </Button>
            <Button type="submit" disabled={save.isPending || !name.trim() || totalSelected === 0}>
              {save.isPending ? t('common:saving') : isEdit ? t('common:save') : t('settings:apiKeys.actions.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Webhooks section ─────────────────────────────────────────────────────────

const WEBHOOK_EVENTS = ['record.created', 'record.updated', 'record.deleted', '*']

function WebhooksSection(): React.ReactElement {
  const { t } = useI18n()
  const client = useAdminClient()
  const qc = useQueryClient()
  const notify = useNotify()
  const dialogs = useDialogs()
  const resources = useResources()
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<WebhookRecord | null>(null)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)

  const list = useQuery({
    queryKey: KEY_WEBHOOKS,
    queryFn: () => client.listWebhooks(),
  })
  const deliveries = useQuery({
    queryKey: ['modern-admin', 'webhooks', selectedId, 'deliveries'],
    queryFn: () => client.listWebhookDeliveries(selectedId!),
    enabled: !!selectedId,
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => client.deleteWebhook(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_WEBHOOKS })
      notify.success({ key: 'settings:webhooks.notice.deleted' })
    },
    onError: (err) => notify.error({ message: err instanceof Error ? err.message : String(err) }),
  })
  const testMut = useMutation({
    mutationFn: (id: string) => client.testWebhook(id),
    onSuccess: () => {
      if (selectedId) qc.invalidateQueries({ queryKey: ['modern-admin', 'webhooks', selectedId, 'deliveries'] })
      notify.success({ key: 'settings:webhooks.notice.testQueued' })
    },
    onError: (err) => notify.error({ message: err instanceof Error ? err.message : String(err) }),
  })

  const webhooks = list.data?.webhooks ?? []

  const onDelete = async (webhook: WebhookRecord): Promise<void> => {
    const ok = await dialogs.confirm({
      title: t('settings:webhooks.confirmDelete.title'),
      description: t('settings:webhooks.confirmDelete.description', { name: webhook.name }),
      confirmLabel: t('common:delete'),
      destructive: true,
    })
    if (ok) deleteMut.mutate(webhook.id)
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard
        icon={SettingsIcon}
        title={t('settings:webhooks.title')}
        description={t('settings:webhooks.description')}
        action={
          <Button size="sm" onClick={() => { setEditing(null); setEditorOpen(true) }}>
            <Plus className="size-4" />
            {t('settings:webhooks.actions.create')}
          </Button>
        }
      >
        <SettingsListState
          isLoading={list.isLoading}
          error={list.error}
          isEmpty={webhooks.length === 0}
          loadingLabel={t('common:loading')}
          empty={{
            icon: SettingsIcon,
            title: t('settings:webhooks.empty.title'),
            description: t('settings:webhooks.empty.description'),
          }}
        >
          <SettingsTableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('settings:webhooks.columns.name')}</TableHead>
                  <TableHead>{t('settings:webhooks.columns.resource')}</TableHead>
                  <TableHead>{t('settings:webhooks.columns.events')}</TableHead>
                  <TableHead>{t('settings:webhooks.columns.enabled')}</TableHead>
                  <TableHead className="text-right">{t('settings:webhooks.columns.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.map((webhook) => (
                  <TableRow key={webhook.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-left font-medium hover:underline"
                        onClick={() => setSelectedId(webhook.id)}
                      >
                        {webhook.name}
                      </button>
                      <div className="max-w-xs truncate text-xs text-muted-foreground">{webhook.url}</div>
                    </TableCell>
                    <TableCell>{resourceName(resources, webhook.resourceId, t('settings:webhooks.editor.allResources'))}</TableCell>
                    <TableCell className="max-w-xs">
                      <div className="flex flex-wrap gap-1">
                        {webhook.events.map((event) => <Badge key={event} variant="outline">{event}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell>{webhook.enabled ? t('common:yes') : t('common:no')}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => testMut.mutate(webhook.id)}>
                          {t('settings:webhooks.actions.test')}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setEditing(webhook); setEditorOpen(true) }}>
                          <Edit className="size-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void onDelete(webhook)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SettingsTableScroll>
        </SettingsListState>
      </SettingsCard>

      {selectedId && (
        <SettingsCard icon={SettingsIcon} title={t('settings:webhooks.deliveries.title')}>
          {deliveries.isLoading ? (
            <div className="py-4 text-sm text-muted-foreground">{t('common:loading')}</div>
          ) : (
            <SettingsTableScroll>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('settings:webhooks.deliveries.status')}</TableHead>
                    <TableHead>{t('settings:webhooks.deliveries.event')}</TableHead>
                    <TableHead>{t('settings:webhooks.deliveries.attempt')}</TableHead>
                    <TableHead>{t('settings:webhooks.deliveries.response')}</TableHead>
                    <TableHead>{t('settings:webhooks.deliveries.createdAt')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(deliveries.data?.deliveries ?? []).map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell>{delivery.status}</TableCell>
                      <TableCell>{delivery.event}</TableCell>
                      <TableCell>{delivery.attempt}</TableCell>
                      <TableCell className="max-w-sm truncate">
                        {delivery.responseStatus ?? delivery.error ?? delivery.responseBody ?? '—'}
                      </TableCell>
                      <TableCell>{formatDate(delivery.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </SettingsTableScroll>
          )}
        </SettingsCard>
      )}

      <WebhookEditorDialog
        key={editing?.id ?? 'new'}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        webhook={editing}
        resources={resources}
      />
    </div>
  )
}

function WebhookEditorDialog({
  open,
  onOpenChange,
  webhook,
  resources,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  webhook: WebhookRecord | null
  resources: ResourceJSON[]
}): React.ReactElement {
  const { t } = useI18n()
  const client = useAdminClient()
  const qc = useQueryClient()
  const notify = useNotify()
  const [name, setName] = React.useState(webhook?.name ?? '')
  const [url, setUrl] = React.useState(webhook?.url ?? '')
  const [resourceId, setResourceId] = React.useState(webhook?.resourceId ?? '')
  const [enabled, setEnabled] = React.useState(webhook?.enabled ?? true)
  const [secret, setSecret] = React.useState(webhook?.secret ?? '')
  const [events, setEvents] = React.useState<string[]>(webhook?.events ?? ['record.created', 'record.updated'])
  const [headers, setHeaders] = React.useState<Record<string, unknown>>(webhook?.headers ?? {})
  const [filters, setFilters] = React.useState<Record<string, unknown>>(webhook?.filters ?? {})
  const [payloadFields, setPayloadFields] = React.useState<string[]>(webhook?.payloadFields ?? [])
  const selectedResource = resources.find((r) => r.id === resourceId)

  const save = useMutation({
    mutationFn: (payload: WebhookInput) =>
      webhook ? client.updateWebhook(webhook.id, payload) : client.createWebhook(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_WEBHOOKS })
      notify.success({ key: 'settings:webhooks.notice.saved' })
      onOpenChange(false)
    },
    onError: (err) => notify.error({ message: err instanceof Error ? err.message : String(err) }),
  })

  const toggleEvent = (event: string): void => {
    setEvents((prev) => prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event])
  }

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    save.mutate({
      name: name.trim(),
      url: url.trim(),
      events,
      resourceId: resourceId || null,
      enabled,
      ...(secret.trim() ? { secret: secret.trim() } : {}),
      headers: stringRecord(headers),
      filters: stringRecord(filters),
      payloadFields,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{webhook ? t('settings:webhooks.editor.titleEdit') : t('settings:webhooks.editor.titleCreate')}</DialogTitle>
          <DialogDescription>{t('settings:webhooks.editor.description')}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('settings:webhooks.editor.name')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>{t('settings:webhooks.editor.url')}</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} required type="url" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('settings:webhooks.editor.resource')}</Label>
              <Select
                value={resourceId || '__all__'}
                onValueChange={(v) => { setResourceId(v === '__all__' ? '' : v); setPayloadFields([]) }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t('settings:webhooks.editor.allResources')}</SelectItem>
                  {resources.map((resource) => (
                    <SelectItem key={resource.id} value={resource.id}>{resource.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label>{t('settings:webhooks.editor.secret')}</Label>
                <InfoTooltip
                  content={t('settings:webhooks.editor.secretHint')}
                  ariaLabel={t('settings:webhooks.editor.secret')}
                  side="right"
                />
              </div>
              <Input value={secret} onChange={(e) => setSecret(e.target.value)} type="password" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <Label>{t('settings:webhooks.editor.enabled')}</Label>
          </div>
          <div className="space-y-2">
            <Label>{t('settings:webhooks.editor.events')}</Label>
            <div className="flex flex-wrap gap-2">
              {WEBHOOK_EVENTS.map((event) => (
                <label key={event} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Checkbox checked={events.includes(event)} onCheckedChange={() => toggleEvent(event)} />
                  {event}
                </label>
              ))}
            </div>
          </div>
          {selectedResource && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label>{t('settings:webhooks.editor.payloadFields')}</Label>
                <InfoTooltip
                  content={t('settings:webhooks.editor.payloadFieldsHint')}
                  ariaLabel={t('settings:webhooks.editor.payloadFields')}
                  side="right"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {selectedResource.properties.map((property) => (
                  <label key={property.path} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={payloadFields.includes(property.path)}
                      onCheckedChange={() =>
                        setPayloadFields((prev) =>
                          prev.includes(property.path)
                            ? prev.filter((p) => p !== property.path)
                            : [...prev, property.path],
                        )
                      }
                    />
                    {property.label}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label>{t('settings:webhooks.editor.headers')}</Label>
                <InfoTooltip
                  content={t('settings:webhooks.editor.headersHint')}
                  ariaLabel={t('settings:webhooks.editor.headers')}
                  side="top"
                />
              </div>
              <JsonEditor value={headers} onChange={(next) => setHeaders(toJsonRecord(next))} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label>{t('settings:webhooks.editor.filters')}</Label>
                <InfoTooltip
                  content={t('settings:webhooks.editor.filtersHint')}
                  ariaLabel={t('settings:webhooks.editor.filters')}
                  side="top"
                />
              </div>
              <JsonEditor value={filters} onChange={(next) => setFilters(toJsonRecord(next))} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common:cancel')}</Button>
            <Button type="submit" disabled={save.isPending || !name.trim() || !url.trim() || events.length === 0}>
              {save.isPending ? t('common:saving') : t('common:save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const resourceName = (
  resources: ResourceJSON[],
  id: string | null | undefined,
  fallback: string,
): string => id ? (resources.find((r) => r.id === id)?.name ?? id) : fallback

const toJsonRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

const stringRecord = (value: Record<string, unknown>): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item != null && item !== '') out[key] = String(item)
  }
  return out
}

// ─── Created-secret dialog ────────────────────────────────────────────────────

function CreatedSecretDialog({
  secret,
  onClose,
}: {
  secret: { key: string; record: ApiKeyRecord } | null
  onClose: () => void
}): React.ReactElement {
  const { t } = useI18n()
  const notify = useNotify()
  const [reveal, setReveal] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!secret) {
      setReveal(false)
      setCopied(false)
    }
  }, [secret])

  const onCopy = async (): Promise<void> => {
    if (!secret) return
    try {
      await navigator.clipboard.writeText(secret.key)
      setCopied(true)
      notify.success({ key: 'settings:apiKeys.notice.copied' })
      setTimeout(() => setCopied(false), 1500)
    } catch {
      notify.error({ key: 'settings:apiKeys.notice.copyFailed' })
    }
  }

  return (
    <Dialog open={!!secret} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SettingsIcon className="size-5" />
            {t('settings:apiKeys.created.title')}
          </DialogTitle>
          <DialogDescription>{t('settings:apiKeys.created.description')}</DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-300/30 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4" />
            <p>{t('settings:apiKeys.created.warning')}</p>
          </div>
        </div>
        <div className="flex items-stretch gap-2">
          <div className="relative flex-1">
            <Input
              readOnly
              type={reveal ? 'text' : 'password'}
              value={secret?.key ?? ''}
              className="pr-10 font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? t('settings:apiKeys.created.hide') : t('settings:apiKeys.created.reveal')}
            >
              {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </div>
          <Button type="button" onClick={onCopy} variant="secondary">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            <span className="hidden sm:inline">
              {copied ? t('settings:apiKeys.created.copied') : t('settings:apiKeys.created.copy')}
            </span>
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{t('common:done')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const formatDate = (input: string | Date): string => {
  try {
    return new Date(input).toLocaleString()
  } catch {
    return String(input)
  }
}
