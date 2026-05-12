// Pure helpers for the RichtextEditor's view-mode logic.
//
// Three modes are supported:
//   - 'wysiwyg' — only the Tiptap editor is visible
//   - 'source'  — only a Textarea (raw HTML or Markdown) is visible
//   - 'split'   — both side-by-side (only meaningful in fullscreen)

export type RichtextMode = 'wysiwyg' | 'source' | 'split'

/**
 * Whether the external `value`→editor sync effect should run for the given mode.
 *
 * In 'source' the textarea owns the content; the editor is hidden and we skip
 * setContent to avoid wasted work.  In 'wysiwyg' and 'split' the editor is
 * visible and must reflect any external change to `value`.
 */
export function shouldSyncEditor(mode: RichtextMode): boolean {
  return mode !== 'source'
}

/**
 * Whether the user can pick the split mode in the current fullscreen state.
 * Split is only useful at full viewport width — outside fullscreen the panes
 * would be too narrow to be usable.
 */
export function isSplitAvailable(fullscreen: boolean): boolean {
  return fullscreen
}

/**
 * Resolves the *effective* mode to render.  When the user has selected
 * split but exits fullscreen, we transparently fall back to wysiwyg so the
 * layout stays usable.  The selected mode is preserved by the caller so that
 * re-entering fullscreen restores the split view.
 */
export function resolveMode(mode: RichtextMode, fullscreen: boolean): RichtextMode {
  if (mode === 'split' && !fullscreen) return 'wysiwyg'
  return mode
}
