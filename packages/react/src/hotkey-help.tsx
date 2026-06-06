// Header button + dialog that surfaces every <useHotkey> entry that opted
// into the registry by passing `description`. Pressing `?` toggles it.

import * as React from 'react'
import {
  Button,
  Kbd,
  KeyboardShortcutsHelp,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@modern-admin/ui'
import { Keyboard } from 'lucide-react'
import { useHotkey } from './use-hotkey.js'
import { useRegisteredHotkeys } from './hotkey-registry.js'
import { useI18n } from './i18n.js'

export function HotkeyHelpButton(): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const items = useRegisteredHotkeys()
  const { t } = useI18n()
  const label = t('common:shortcutsHelp')

  useHotkey('?', () => setOpen((v) => !v), {
    description: label,
  })

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            aria-label={label}
            className="hidden md:inline-flex"
          >
            <Keyboard className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="flex items-center gap-1.5">
          <span>{label}</span>
          <Kbd>?</Kbd>
        </TooltipContent>
      </Tooltip>
      <KeyboardShortcutsHelp
        open={open}
        onOpenChange={setOpen}
        items={items}
        title={label}
        emptyMessage={t('common:shortcutsEmpty')}
      />
    </>
  )
}
