// Pure helpers for RichtextEditor content sync logic.
// Extracted so they can be unit-tested without a DOM/React environment.

import type { RichtextFormat } from './richtext-editor.js'

/**
 * Reads the current content from a Tiptap editor instance.
 * Returns the HTML or Markdown string depending on `format`.
 */
export function readEditorContent(
  ed: { getHTML(): string; storage: unknown },
  format: RichtextFormat,
): string {
  if (format === 'markdown') {
    return (
      (ed.storage as { markdown?: { getMarkdown?(): string } }).markdown?.getMarkdown?.() ?? ''
    )
  }
  return ed.getHTML()
}

/**
 * Returns `true` if the editor content should be replaced with the external
 * `value` (i.e. `editor.commands.setContent(value)` should be called).
 *
 * Returns `false` when:
 *
 * 1. `pendingFormatChange === true` — a format switch was just initiated.
 *    In this intermediate React render, `activeFormat` has already been
 *    updated to the new format while the external `value` still holds the
 *    previous format's string (the parent hasn't re-rendered yet).
 *    Calling `setContent` here would write the stale, wrong-format string
 *    into the editor and corrupt the content. The flag is cleared after the
 *    first effect run, so once `value` catches up the normal diff logic
 *    takes over again.
 *
 * 2. `value === lastEmitted` — the parent is just echoing back a value we
 *    ourselves emitted via onChange.  This is the common race during fast
 *    typing: the user keeps typing while React is still committing the
 *    previous onChange, so by the time the effect runs the editor is
 *    *already* ahead of value.  Calling setContent in that frame would
 *    rewind the editor to a stale state, dropping the most recent
 *    keystrokes and resetting the cursor.  When value matches lastEmitted
 *    we trust the editor and skip the sync.
 *
 * 3. `editorContent === value` — the editor already has the correct content.
 */
export function shouldSyncToEditor(
  editorContent: string,
  value: string,
  pendingFormatChange: boolean,
  lastEmitted?: string,
): boolean {
  if (pendingFormatChange) return false
  if (lastEmitted !== undefined && value === lastEmitted) return false
  return editorContent !== value
}
