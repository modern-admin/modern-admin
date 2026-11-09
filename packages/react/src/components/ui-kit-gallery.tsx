import * as React from 'react'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Combobox,
  DatePicker,
  DateRangeInput,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  JsonEditor,
  Pagination,
  PasswordInput,
  Progress,
  RadioGroup,
  RadioGroupItem,
  Slider,
  Spinner,
  ToggleGroup,
  ToggleGroupItem,
  TooltipProvider,
  CHART_PALETTE,
  ChartPanel,
  dateFnsLocale,
} from '@modern-admin/ui'
import { useI18n } from '../i18n.js'

/** Interactive reference for the UI kit. Requires only an I18nProvider. */
export function UiKitGallery(): React.ReactElement {
  const { t, locale, setLocale, availableLocales } = useI18n()
  const [dark, setDark] = React.useState(false)
  React.useEffect(() => {
    const root = document.documentElement
    const previous = root.classList.contains('dark')
    root.classList.toggle('dark', dark)
    return () => {
      root.classList.toggle('dark', previous)
    }
  }, [dark])
  const [query, setQuery] = React.useState('')
  const [date, setDate] = React.useState('2026-11-06')
  const [range, setRange] = React.useState({ from: '', to: '' })
  const [json, setJson] = React.useState<unknown>({ enabled: true })
  const [page, setPage] = React.useState(0)
  const [choice, setChoice] = React.useState('yes')
  const [view, setView] = React.useState('list')
  const [progress, setProgress] = React.useState([60])
  const [loading, setLoading] = React.useState(false)
  const passwordId = React.useId()
  const errorId = React.useId()
  const radioId = React.useId()
  const localeId = React.useId()
  const l = dateFnsLocale(locale)
  return (
    <TooltipProvider>
      <main
        className={
          dark
            ? 'dark min-h-dvh bg-background text-foreground'
            : 'min-h-dvh bg-background text-foreground'
        }
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">{t('uiKit:title')}</h1>
              <p className="text-sm text-muted-foreground">{t('uiKit:description')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor={localeId}>{t('common:language')}</label>
              <select
                id={localeId}
                value={locale}
                onChange={(event) => setLocale(event.target.value)}
                className="rounded-md border border-input bg-background p-2 text-sm"
              >
                {availableLocales().map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
              <Button variant="outline" onClick={() => setDark(!dark)} aria-pressed={dark}>
                {t('common:toggleTheme')}
              </Button>
            </div>
          </header>
          <div className="grid min-w-0 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle asChild>
                  <h2>{t('uiKit:feedback')}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {(['success', 'warning', 'info', 'destructive'] as const).map((variant) => (
                  <Alert key={variant} variant={variant}>
                    <AlertTitle>{t(`uiKit:${variant}`)}</AlertTitle>
                    <AlertDescription>{t('uiKit:description')}</AlertDescription>
                  </Alert>
                ))}
                <div className="flex flex-wrap gap-2">
                  {(['success', 'warning', 'info', 'destructive'] as const).map((variant) => (
                    <Badge key={variant} variant={variant}>
                      {t(`uiKit:${variant}`)}
                    </Badge>
                  ))}
                </div>
                <Spinner label={t('common:loading')} />
                <Progress value={progress[0]} aria-label={t('uiKit:progress')} />
                <Slider
                  value={progress}
                  onValueChange={setProgress}
                  aria-label={t('uiKit:progress')}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle asChild>
                  <h2>{t('uiKit:controls')}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor={passwordId}>{t('auth:password')}</FieldLabel>
                    <PasswordInput
                      id={passwordId}
                      autoComplete="new-password"
                      labels={{ show: t('common:showPassword'), hide: t('common:hidePassword') }}
                    />
                  </Field>
                  <Field invalid>
                    <FieldLabel htmlFor={`${errorId}-input`}>{t('auth:email')}</FieldLabel>
                    <Input
                      id={`${errorId}-input`}
                      type="email"
                      aria-invalid
                      aria-describedby={errorId}
                    />
                    <FieldError id={errorId}>
                      {t('validation:invalidEmail', { label: t('auth:email') })}
                    </FieldError>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${radioId}-search`}>{t('common:search')}</FieldLabel>
                    <Combobox
                      id={`${radioId}-search`}
                      aria-label={t('common:search')}
                      value={query}
                      onChange={setQuery}
                      suggestions={availableLocales().map((item) => item.name)}
                      labels={{
                        loading: t('common:loading'),
                        noMatches: t('keyValue:noMatches'),
                        toggleSuggestions: t('common:toggleSuggestions'),
                      }}
                    />
                  </Field>
                  <InputGroup>
                    <InputGroupAddon>
                      <InputGroupText>@</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput aria-label={t('auth:email')} />
                  </InputGroup>
                  <RadioGroup
                    value={choice}
                    onValueChange={setChoice}
                    aria-label={t('common:confirm')}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="yes" id={`${radioId}-yes`} />
                      <FieldLabel htmlFor={`${radioId}-yes`}>{t('common:yes')}</FieldLabel>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="no" id={`${radioId}-no`} />
                      <FieldLabel htmlFor={`${radioId}-no`}>{t('common:no')}</FieldLabel>
                    </div>
                  </RadioGroup>
                  <ToggleGroup
                    type="single"
                    value={view}
                    onValueChange={(next) => {
                      if (next) setView(next)
                    }}
                    variant="outline"
                    aria-label={t('common:show')}
                  >
                    <ToggleGroupItem value="list">
                      {t('common:recordsCount', { count: 3 })}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="chart">{t('uiKit:charts')}</ToggleGroupItem>
                  </ToggleGroup>
                </FieldGroup>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle asChild>
                  <h2>{t('uiKit:editors')}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <DatePicker
                  value={date}
                  onChange={setDate}
                  aria-label={t('common:from')}
                  locale={l}
                  labels={{ openCalendar: t('common:openCalendar'), time: t('common:time') }}
                />
                <DateRangeInput
                  {...range}
                  onChange={(from, to) => setRange({ from, to })}
                  locale={l}
                  aria-label={t('audit:dateRangePlaceholder')}
                  labels={{
                    placeholder: t('audit:dateRangePlaceholder'),
                    apply: t('common:apply'),
                    clear: t('common:clear'),
                  }}
                />
                <JsonEditor
                  value={json}
                  onChange={setJson}
                  aria-label={t('uiKit:editors')}
                  labels={{ format: t('common:format'), invalid: t('common:invalidJson') }}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle asChild>
                  <h2>{t('uiKit:actions')}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-2">
                  <Button loading={loading} onClick={() => setLoading(true)}>
                    {t('common:save')}
                  </Button>
                  <Button variant="outline" onClick={() => setLoading(false)}>
                    {t('common:cancel')}
                  </Button>
                  <Button disabled>{t('common:delete')}</Button>
                </div>
                <ButtonGroup aria-label={t('common:actions')}>
                  <Button variant="outline">{t('common:edit')}</Button>
                  <Button variant="outline">{t('common:show')}</Button>
                </ButtonGroup>
                <div className="max-w-full overflow-x-auto">
                  <Pagination
                    pageIndex={page}
                    pageCount={12}
                    windowSize={3}
                    onPageChange={setPage}
                    labels={{
                      navigation: t('common:pagination'),
                      first: t('common:firstPage'),
                      previous: t('common:previousPage'),
                      next: t('common:nextPage'),
                      last: t('common:lastPage'),
                    }}
                  />
                </div>
                <div className="flex gap-2" role="group" aria-label={t('uiKit:charts')}>
                  {CHART_PALETTE.map((color) => (
                    <span
                      key={color}
                      className="size-8 rounded-md"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <ChartPanel
                  labels={{ noData: t('chart:noData'), value: t('chart:value') }}
                  type="bar"
                  data={[
                    { label: t('common:yes'), value: 8 },
                    { label: t('common:no'), value: 3 },
                  ]}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </TooltipProvider>
  )
}
