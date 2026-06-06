import { describe, expect, test } from 'bun:test'
import {
  isSplitAvailable,
  resolveMode,
  shouldSyncEditor,
  type RichtextMode,
} from '../src/components/richtext-mode.js'

// ---------------------------------------------------------------------------
// shouldSyncEditor — controls whether external value→editor sync runs
// ---------------------------------------------------------------------------
//
// Background: the sync effect that calls editor.commands.setContent must be
// skipped when the user is editing the raw source in a Textarea (mode='source')
// because in that mode the textarea is the single source of truth and
// re-injecting `value` into the WYSIWYG would either be wasted work or, worse,
// fight with the textarea on every keystroke.
//
// In split mode both the textarea AND the editor are visible and bound to the
// same `value`. When the user types in the textarea, value flows through
// onChange; the editor must reflect the updated value, so sync MUST run.
// When the user types in the editor, onUpdate fires onChange(value) and the
// textarea re-renders from value — no setContent call is needed (the diff
// returns false because editor content already matches value).

describe('shouldSyncEditor', () => {
  test('returns true for wysiwyg mode', () => {
    expect(shouldSyncEditor('wysiwyg')).toBe(true)
  })

  test('returns false for source mode (textarea owns the content)', () => {
    expect(shouldSyncEditor('source')).toBe(false)
  })

  test('returns true for split mode (both panes are bound to value)', () => {
    expect(shouldSyncEditor('split')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isSplitAvailable — split is only meaningful at full viewport width
// ---------------------------------------------------------------------------

describe('isSplitAvailable', () => {
  test('returns true when fullscreen is on', () => {
    expect(isSplitAvailable(true)).toBe(true)
  })

  test('returns false when fullscreen is off (split would be too cramped)', () => {
    expect(isSplitAvailable(false)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// resolveMode — collapses split to wysiwyg when fullscreen is off
// ---------------------------------------------------------------------------
//
// When the user is in split mode and exits fullscreen, the split layout no
// longer fits. Rather than render a degraded view or lose state, we transparently
// resolve the effective mode to 'wysiwyg'. The user's chosen mode is preserved
// in state so re-entering fullscreen restores split.

describe('resolveMode', () => {
  test('returns wysiwyg unchanged in any fullscreen state', () => {
    expect(resolveMode('wysiwyg', true)).toBe('wysiwyg')
    expect(resolveMode('wysiwyg', false)).toBe('wysiwyg')
  })

  test('returns source unchanged in any fullscreen state', () => {
    expect(resolveMode('source', true)).toBe('source')
    expect(resolveMode('source', false)).toBe('source')
  })

  test('returns split when fullscreen is on', () => {
    expect(resolveMode('split', true)).toBe('split')
  })

  test('collapses split to wysiwyg when fullscreen is off', () => {
    expect(resolveMode('split', false)).toBe('wysiwyg')
  })

  test('all RichtextMode values are handled exhaustively', () => {
    const modes: RichtextMode[] = ['wysiwyg', 'source', 'split']
    for (const m of modes) {
      // Should not throw or return undefined for any valid mode
      expect(resolveMode(m, true)).toBeDefined()
      expect(resolveMode(m, false)).toBeDefined()
    }
  })
})
