import * as React from 'react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@modern-admin/ui'
import { RotateCcw, Trash2 } from 'lucide-react'
import {
  useCacheStats,
  useInvalidateResourceCache,
  useResetCacheStats,
  useResources,
} from '../hooks.js'
import { useI18n } from '../i18n.js'
import { useNotify } from '../notify.js'

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0)

export function CachePage(): React.ReactElement {
  const { t, locale } = useI18n()
  const notify = useNotify()
  const resources = useResources()
  const stats = useCacheStats()
  const invalidate = useInvalidateResourceCache()
  const reset = useResetCacheStats()
  const [resourceId, setResourceId] = React.useState(resources[0]?.id ?? '')

  React.useEffect(() => {
    if (!resourceId && resources[0]) setResourceId(resources[0].id)
  }, [resourceId, resources])

  const entries = stats.data?.entries ?? []
  const hits = sum(entries.map((entry) => entry.hits))
  const misses = sum(entries.map((entry) => entry.misses))
  const requests = hits + misses
  const hitRate = requests > 0 ? (hits / requests) * 100 : 0
  const computes = sum(entries.map((entry) => entry.computes))
  const computeMs = sum(entries.map((entry) => entry.computeMs))
  const errors = sum(
    entries.map((entry) => entry.readErrors + entry.writeErrors + entry.invalidationErrors),
  )
  const number = React.useMemo(() => new Intl.NumberFormat(locale), [locale])

  const invalidateSelected = (): void => {
    if (!resourceId) return
    notify.promise(invalidate.mutateAsync(resourceId), {
      loading: { key: 'cache:invalidate.loading' },
      success: { key: 'cache:invalidate.success' },
      error: { key: 'cache:invalidate.error' },
    })
  }

  const resetMetrics = (): void => {
    notify.promise(reset.mutateAsync(), {
      loading: { key: 'cache:reset.loading' },
      success: { key: 'cache:reset.success' },
      error: { key: 'cache:reset.error' },
    })
  }

  if (stats.isLoading) {
    return (
      <div className="flex flex-col gap-3 pb-4 sm:gap-4 sm:pb-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  if (stats.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('cache:load.error')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void stats.refetch()}>
            <RotateCcw data-icon="inline-start" />
            {t('cache:load.retry')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3 pb-4 sm:gap-4 sm:pb-6">
      <Card>
        <CardHeader className="sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <CardTitle>{t('cache:title')}</CardTitle>
            <CardDescription>{t('cache:description')}</CardDescription>
          </div>
          <Button variant="outline" size="sm" disabled={reset.isPending} onClick={resetMetrics}>
            <RotateCcw data-icon="inline-start" />
            {t('cache:reset.action')}
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label={t('cache:metric.hitRate')} value={`${hitRate.toFixed(1)}%`} />
          <Metric label={t('cache:metric.requests')} value={number.format(requests)} />
          <Metric
            label={t('cache:metric.avgCompute')}
            value={
              computes > 0
                ? t('cache:unit.ms').replace(
                    '{value}',
                    number.format(Math.round(computeMs / computes)),
                  )
                : '—'
            }
          />
          <Metric label={t('cache:metric.errors')} value={number.format(errors)} />
        </CardContent>
      </Card>

      {(stats.data?.dirtyTags.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('cache:quarantine.title')}</CardTitle>
            <CardDescription>{t('cache:quarantine.description')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {stats.data?.dirtyTags.map((tag) => (
              <Badge key={tag} variant="destructive">
                {tag}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('cache:invalidate.title')}</CardTitle>
          <CardDescription>{t('cache:invalidate.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Select value={resourceId} onValueChange={setResourceId}>
            <SelectTrigger aria-label={t('cache:invalidate.resource')} className="sm:max-w-sm">
              <SelectValue placeholder={t('cache:invalidate.resource')} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {resources.map((resource) => (
                  <SelectItem key={resource.id} value={resource.id}>
                    {resource.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            variant="outline-destructive"
            disabled={!resourceId || invalidate.isPending}
            onClick={invalidateSelected}
          >
            <Trash2 data-icon="inline-start" />
            {t('cache:invalidate.action')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('cache:table.title')}</CardTitle>
          <CardDescription>
            {t('cache:instance').replace('{id}', stats.data?.instanceId ?? '—')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('cache:table.namespace')}</TableHead>
                <TableHead>{t('cache:table.resource')}</TableHead>
                <TableHead>{t('cache:table.hits')}</TableHead>
                <TableHead>{t('cache:table.misses')}</TableHead>
                <TableHead>{t('cache:table.computes')}</TableHead>
                <TableHead>{t('cache:table.coalesced')}</TableHead>
                <TableHead>{t('cache:table.errors')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    {t('cache:table.empty')}
                  </TableCell>
                </TableRow>
              )}
              {entries.map((entry) => (
                <TableRow key={`${entry.namespace}:${entry.resourceId ?? '*'}`}>
                  <TableCell>
                    <Badge variant="outline">{entry.namespace}</Badge>
                  </TableCell>
                  <TableCell>{entry.resourceId ?? '—'}</TableCell>
                  <TableCell>{number.format(entry.hits)}</TableCell>
                  <TableCell>{number.format(entry.misses)}</TableCell>
                  <TableCell>{number.format(entry.computes)}</TableCell>
                  <TableCell>{number.format(entry.coalesced)}</TableCell>
                  <TableCell>
                    {number.format(entry.readErrors + entry.writeErrors + entry.invalidationErrors)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
    </div>
  )
}
