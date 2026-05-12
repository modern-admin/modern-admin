// Presentational dialog that lists keyboard shortcuts. Pass `items`;
// each entry's `keys` is a `+`-separated combo string (e.g. `mod+s`)
// and gets rendered as <Kbd> caps. `mod` resolves to ⌘ on macOS / Ctrl
// elsewhere via `getModKeyLabel()`. Items can optionally be grouped via
// `group` and the dialog sorts groups in insertion order.

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './dialog.js'
import { Kbd, getModKeyLabel } from './kbd.js'

export interface KeyboardShortcutItem {
  /** Combo in `useHotkey` syntax, e.g. `mod+s`, `shift+/`, `esc`. */
  keys: string
  description: string
  group?: string
}

export interface KeyboardShortcutsHelpProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: KeyboardShortcutItem[]
  title?: React.ReactNode
  description?: React.ReactNode
  emptyMessage?: React.ReactNode
}

function chordParts(combo: string, modLabel: string): string[] {
  // Pick the first alternative (`a|b`) — the help dialog shows one
  // canonical chord per entry.
  const first = combo.split('|')[0] ?? ''
  return first
    .split('+')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((p) => {
      if (p === 'mod' || p === 'ctrl' || p === 'meta' || p === 'cmd') return modLabel
      if (p === 'shift') return 'Shift'
      if (p === 'alt' || p === 'option') return 'Alt'
      if (p === 'esc' || p === 'escape') return 'Esc'
      if (p === 'space' || p === ' ' || p === 'spacebar') return 'Space'
      if (p === 'enter' || p === 'return') return 'Enter'
      if (p === 'tab') return 'Tab'
      if (p === 'backspace') return '⌫'
      if (p === 'delete' || p === 'del') return 'Del'
      if (p === 'arrowup') return '↑'
      if (p === 'arrowdown') return '↓'
      if (p === 'arrowleft') return '←'
      if (p === 'arrowright') return '→'
      if (p.length === 1) return p.toUpperCase()
      return p.charAt(0).toUpperCase() + p.slice(1)
    })
}

export function KeyboardShortcutsHelp({
  open,
  onOpenChange,
  items,
  title,
  description,
  emptyMessage,
}: KeyboardShortcutsHelpProps): React.ReactElement {
  const modLabel = getModKeyLabel()

  // Group preserving insertion order.
  const groups = React.useMemo(() => {
    const m = new Map<string, KeyboardShortcutItem[]>()
    for (const it of items) {
      const key = it.group ?? ''
      const list = m.get(key)
      if (list) list.push(it)
      else m.set(key, [it])
    }
    return Array.from(m.entries())
  }, [items])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* aria-describedby={undefined} explicitly suppresses Radix's missing-
          description warning for dialogs where no <DialogDescription> is
          rendered. When `description` is provided the prop is omitted so
          Radix can wire its context-based aria-describedby automatically. */}
      <DialogContent
        className="max-w-md"
        {...(!description ? { 'aria-describedby': undefined } : {})}
      >
        <DialogHeader>
          <DialogTitle>{title ?? 'Keyboard shortcuts'}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {emptyMessage ?? 'No shortcuts available on this screen.'}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map(([groupName, list]) => (
              <div key={groupName || '__default__'} className="flex flex-col gap-2">
                {groupName && (
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {groupName}
                  </h3>
                )}
                <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                  {list.map((it, idx) => (
                    <li
                      key={`${it.keys}:${idx}`}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <span className="text-sm">{it.description}</span>
                      <span className="inline-flex shrink-0 items-center gap-1">
                        {chordParts(it.keys, modLabel).map((part, i, arr) => (
                          <React.Fragment key={i}>
                            <Kbd>{part}</Kbd>
                            {i < arr.length - 1 && (
                              <span className="text-muted-foreground">+</span>
                            )}
                          </React.Fragment>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
