// Tiny keyboard-shortcut hook. Each combo is a `+`-separated string,
// e.g. `mod+s`, `ctrl+shift+k`, `esc`. `mod` matches Ctrl on
// Windows/Linux and Cmd on macOS so Ctrl+S / ⌘S map to the same handler.
//
// By default a chord with a modifier (mod / alt) fires anywhere; a
// modifier-less chord is suppressed when focus is inside an input,
// textarea, select, or contenteditable element so plain `n`/`r` keys
// don't hijack typing. Override per-call with `allowInInput`.

import * as React from 'react'
import { useHotkeyRegister } from './hotkey-registry.js'

export interface HotkeyOptions {
  enabled?: boolean
  /** Override input-suppression. `true` always fires, `false` never. */
  allowInInput?: boolean
  /** Call `preventDefault()` on match. Default `true`. */
  preventDefault?: boolean
  /**
   * Human-readable label shown in <KeyboardShortcutsHelp>. When set, the
   * hotkey registers itself with the surrounding HotkeyRegistryProvider
   * for the duration it's mounted (and `enabled`).
   */
  description?: string
  /** Optional group label used to bucket entries in the help dialog. */
  group?: string
}

interface ParsedCombo {
  key: string
  code: string | null
  mod: boolean
  shift: boolean
  alt: boolean
  hasModifier: boolean
}

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  space: ' ',
  spacebar: ' ',
  return: 'enter',
  del: 'delete',
}

function keyToCode(key: string): string | null {
  if (/^[a-z]$/.test(key)) return `Key${key.toUpperCase()}`
  if (/^[0-9]$/.test(key)) return `Digit${key}`
  return null
}

function parseCombo(s: string): ParsedCombo {
  const parts = s.toLowerCase().split('+').map((p) => p.trim()).filter(Boolean)
  const last = parts[parts.length - 1] ?? ''
  const key = KEY_ALIASES[last] ?? last
  const code = keyToCode(key)
  const mod = parts.some((p) => p === 'mod' || p === 'ctrl' || p === 'meta' || p === 'cmd')
  const shift = parts.includes('shift')
  const alt = parts.includes('alt') || parts.includes('option')
  return { key, code, mod, shift, alt, hasModifier: mod || alt }
}

function normalizeEventKey(e: KeyboardEvent): string | null {
  return typeof e.key === 'string' ? e.key.toLowerCase() : null
}

function normalizeEventCode(e: KeyboardEvent): string | null {
  return typeof e.code === 'string' && e.code.length > 0 ? e.code : null
}

function matches(c: ParsedCombo, e: KeyboardEvent): boolean {
  if (c.code) {
    const code = normalizeEventCode(e)
    if (!code || code !== c.code) return false
  } else {
    const k = normalizeEventKey(e)
    if (!k || k !== c.key) return false
  }
  const hasMod = e.ctrlKey || e.metaKey
  if (c.mod !== hasMod) return false
  if (c.alt !== e.altKey) return false
  // Require shift only when explicitly asked. Letter keys may have shift
  // accidentally engaged (caps lock, etc.) — allow that case.
  if (c.shift && !e.shiftKey) return false
  return true
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

export function useHotkey(
  combo: string | string[],
  handler: (e: KeyboardEvent) => void,
  options: HotkeyOptions = {},
): void {
  const { enabled = true, allowInInput, preventDefault = true, description, group } = options
  const handlerRef = React.useRef(handler)
  React.useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  const comboKey = Array.isArray(combo) ? combo.join('|') : combo
  const register = useHotkeyRegister()

  React.useEffect(() => {
    if (!enabled) return
    const parsed = comboKey.split('|').map(parseCombo)
    const onKeyDown = (e: KeyboardEvent): void => {
      const hit = parsed.find((c) => matches(c, e))
      if (!hit) return
      const allow = allowInInput ?? hit.hasModifier
      if (!allow && isEditableTarget(e.target)) return
      if (preventDefault) e.preventDefault()
      handlerRef.current(e)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [comboKey, enabled, allowInInput, preventDefault])

  React.useEffect(() => {
    if (!enabled || !description) return
    return register({ keys: comboKey, description, group })
  }, [enabled, description, group, comboKey, register])
}
