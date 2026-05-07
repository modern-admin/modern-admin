// Theme + language switchers for the admin header. Both render as
// dropdown menus using shadcn primitives and reflect persistent state
// (theme via @modern-admin/ui's lib/theme; locale via I18nProvider).

import * as React from 'react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ScrollArea,
  readThemeMode,
  setThemeMode,
  type ThemeMode,
} from '@modern-admin/ui'
import { Check, Languages, Monitor, Moon, Sun } from 'lucide-react'
import { useI18n } from './i18n.js'

/** Single dropdown row with a leading icon, label, and trailing check when active. */
function MenuOption({
  icon,
  label,
  active,
  onSelect,
}: {
  icon?: React.ReactNode
  label: React.ReactNode
  active: boolean
  onSelect(): void
}): React.ReactElement {
  return (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault()
        onSelect()
      }}
      className="gap-3 px-3 py-2"
    >
      {icon && <span className="flex size-4 items-center justify-center text-muted-foreground">{icon}</span>}
      <span className="flex-1 truncate">{label}</span>
      {active && <Check className="size-4 text-primary" />}
    </DropdownMenuItem>
  )
}

export function ThemeToggle(): React.ReactElement {
  const { t } = useI18n()
  const [mode, setMode] = React.useState<ThemeMode>(() => readThemeMode())
  const apply = (next: ThemeMode): void => {
    setThemeMode(next)
    setMode(next)
  }
  const Icon = mode === 'dark' ? Moon : mode === 'light' ? Sun : Monitor
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('common:toggleTheme')}>
          <Icon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-44 p-1">
        <DropdownMenuLabel className="px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">
          {t('common:theme')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <MenuOption
          icon={<Sun className="size-4" />}
          label="Light"
          active={mode === 'light'}
          onSelect={() => apply('light')}
        />
        <MenuOption
          icon={<Moon className="size-4" />}
          label="Dark"
          active={mode === 'dark'}
          onSelect={() => apply('dark')}
        />
        <MenuOption
          icon={<Monitor className="size-4" />}
          label="System"
          active={mode === 'system'}
          onSelect={() => apply('system')}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function LanguageSwitcher(): React.ReactElement {
  const { locale, setLocale, availableLocales, t } = useI18n()
  const locales = availableLocales()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Languages className="size-4" />
          <span className="text-xs uppercase">{locale}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-52 p-1">
        <DropdownMenuLabel className="px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">
          {t('common:language')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="max-h-72">
          {locales.map((l) => (
            <MenuOption
              key={l.code}
              label={l.name}
              active={l.code === locale}
              onSelect={() => setLocale(l.code)}
            />
          ))}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
