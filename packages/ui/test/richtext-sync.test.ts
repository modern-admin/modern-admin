import { describe, expect, test } from 'bun:test'
import { readEditorContent, shouldSyncToEditor } from '../src/components/richtext-sync.js'
import type { RichtextFormat } from '../src/components/richtext-editor.js'

// ---------------------------------------------------------------------------
// readEditorContent
// ---------------------------------------------------------------------------

describe('readEditorContent', () => {
  test('returns HTML when format is html', () => {
    const ed = {
      getHTML: () => '<p>Hello <strong>world</strong></p>',
      storage: {},
    }
    expect(readEditorContent(ed, 'html')).toBe('<p>Hello <strong>world</strong></p>')
  })

  test('returns markdown from tiptap storage when format is markdown', () => {
    const ed = {
      getHTML: () => '<p>Hello</p>',
      storage: { markdown: { getMarkdown: () => 'Hello **world**' } },
    }
    expect(readEditorContent(ed, 'markdown')).toBe('Hello **world**')
  })

  test('returns empty string when markdown storage object is absent', () => {
    const ed = { getHTML: () => '<p>Hello</p>', storage: {} }
    expect(readEditorContent(ed, 'markdown')).toBe('')
  })

  test('returns empty string when getMarkdown is not a function', () => {
    const ed = {
      getHTML: () => '<p>Hello</p>',
      storage: { markdown: {} },
    }
    expect(readEditorContent(ed, 'markdown')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// shouldSyncToEditor
// ---------------------------------------------------------------------------

describe('shouldSyncToEditor', () => {
  // ── happy-path sync ───────────────────────────────────────────────────────

  test('returns true when editor content differs from value (external reset)', () => {
    expect(shouldSyncToEditor('<p>old</p>', '<p>new</p>', false)).toBe(true)
  })

  test('returns false when editor already matches value', () => {
    expect(shouldSyncToEditor('<p>hello</p>', '<p>hello</p>', false)).toBe(false)
  })

  test('returns false for empty content with no change', () => {
    expect(shouldSyncToEditor('', '', false)).toBe(false)
  })

  // ── THE BUG: intermediate render after format switch ──────────────────────
  //
  // When the user clicks the MD/HTML toggle:
  //   1. handleFormatChange sets activeFormat = 'markdown'
  //   2. onChange('Hello **world**') is called — the parent will update value
  //      asynchronously
  //   3. React may render an intermediate frame where activeFormat='markdown'
  //      but value is still the old HTML string '<p>Hello <strong>…</strong></p>'
  //   4. The sync useEffect fires (activeFormat is in its deps) and compares:
  //        readEditorContent(editor, 'markdown')  →  'Hello **world**'
  //        value                                  →  '<p>Hello <strong>…</strong></p>'
  //   5. They differ → setContent('<p>…</p>') is called while the editor is
  //      in markdown mode → the HTML string is treated as literal markdown text
  //      → content is corrupted.
  //
  // The fix: pendingFormatChangeRef is set to true in handleFormatChange and
  // cleared after the first effect run, suppressing the spurious sync.

  test('returns false when pendingFormatChange is true (stale value guard)', () => {
    // Stale value: parent has not yet received the onChange emitted by the
    // format switch. Without the guard this would trigger setContent with HTML
    // while the editor is already in markdown mode, corrupting the content.
    expect(
      shouldSyncToEditor(
        'Hello **world**',                       // editor: markdown content
        '<p>Hello <strong>world</strong></p>',   // value: still old HTML
        true,                                    // pendingFormatChange = true
      ),
    ).toBe(false)
  })

  test('returns false once value catches up after format switch (no spurious sync)', () => {
    // pendingFormatChange was cleared; parent updated value to the new format.
    // Editor already has the right content — no sync needed.
    expect(shouldSyncToEditor('Hello **world**', 'Hello **world**', false)).toBe(false)
  })

  // ── external reset after format switch (must still sync) ─────────────────

  test('returns true when parent explicitly resets value while format is stable', () => {
    // No format change is pending; the parent reset the form value.
    // pendingFormatChange is false → normal diff applies.
    expect(shouldSyncToEditor('<p>old content</p>', '<p>reset content</p>', false)).toBe(true)
  })

  test('returns true for markdown reset with no pending format change', () => {
    expect(shouldSyncToEditor('old markdown', '# New heading', false)).toBe(true)
  })

  // ── echo-suppression: parent's value is just our own onChange coming back ─
  //
  // When the user types in the editor:
  //   1. onUpdate fires → onChange(html_v1) is called
  //   2. React schedules a re-render with the new value=html_v1 — this happens
  //      asynchronously. While we wait:
  //   3. The user types another character → onUpdate fires → onChange(html_v2)
  //      — editor now contains html_v2, but value is still html_v0 (or html_v1)
  //   4. React commits value=html_v1
  //   5. Sync effect runs: editorContent=html_v2, value=html_v1 → DIFFER
  //   6. Without the lastEmitted guard, setContent(html_v1) is called →
  //      editor reverts to html_v1, losing the most recently typed character
  //      and resetting the cursor position.
  //
  // The lastEmitted argument captures the most recent onChange we emitted.
  // If `value` equals lastEmitted, we know the parent is just echoing back
  // a value we already produced, and the editor's *current* state (which may
  // already be ahead of value) is the source of truth. Skip sync.

  test('returns false when value matches lastEmitted (echo of our own onChange)', () => {
    expect(
      shouldSyncToEditor(
        '<p>hello world</p>',  // editor: ahead, user just typed " world"
        '<p>hello</p>',        // value: stale echo of an earlier onChange
        false,
        '<p>hello</p>',        // lastEmitted: matches value → it's our echo
      ),
    ).toBe(false)
  })

  test('returns true when value differs from lastEmitted (true external change)', () => {
    // Parent reset the form to a brand-new value that we never emitted.
    // The lastEmitted value is something we emitted long ago and the parent
    // has already moved past it.
    expect(
      shouldSyncToEditor(
        '<p>hello</p>',          // editor: still has our last emit
        '<p>RESET</p>',          // value: external reset
        false,
        '<p>hello</p>',          // lastEmitted: what we sent before the reset
      ),
    ).toBe(true)
  })

  test('lastEmitted is optional — backwards-compatible with 3-arg call', () => {
    // Existing callsites that don't pass lastEmitted still get plain diff.
    expect(shouldSyncToEditor('<p>a</p>', '<p>b</p>', false)).toBe(true)
    expect(shouldSyncToEditor('<p>a</p>', '<p>a</p>', false)).toBe(false)
  })

  test('pendingFormatChange wins over lastEmitted (format switch is special)', () => {
    // Even if value happens to match lastEmitted during a format switch,
    // we must not run the diff at all — pendingFormatChange short-circuits.
    expect(
      shouldSyncToEditor('Hello', '<p>Hello</p>', true, '<p>Hello</p>'),
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// readEditorContent — HTML vs Markdown parity
// ---------------------------------------------------------------------------

describe('readEditorContent — format parity', () => {
  // This group documents the expectation that when both getHTML() and
  // getMarkdown() are available on the same mock editor, readEditorContent
  // returns each format independently without cross-contamination.

  const richEd = {
    getHTML: () => '<h2>Title</h2><p>Hello <strong>world</strong></p>',
    storage: {
      markdown: {
        getMarkdown: () => '## Title\n\nHello **world**',
      },
    },
  }

  test('html format returns HTML', () => {
    expect(readEditorContent(richEd, 'html')).toBe(
      '<h2>Title</h2><p>Hello <strong>world</strong></p>',
    )
  })

  test('markdown format returns markdown', () => {
    expect(readEditorContent(richEd, 'markdown')).toBe('## Title\n\nHello **world**')
  })

  test('toggling format returns different representations of the same content', () => {
    const html = readEditorContent(richEd, 'html')
    const md = readEditorContent(richEd, 'markdown')
    // They represent the same document but differ in syntax
    expect(html).not.toBe(md)
    expect(html).toContain('<h2>')
    expect(md).toContain('## ')
  })
})

// ---------------------------------------------------------------------------
// Integration: simulate full format-switch lifecycle
// ---------------------------------------------------------------------------

describe('format switch lifecycle (pure simulation)', () => {
  // Models the sequence of effect calls that happen when the user switches
  // from HTML to Markdown.  Each "frame" is one invocation of the sync effect.

  type EditorState = { html: string; md: string }
  const read =
    (state: EditorState) =>
      (fmt: RichtextFormat): string =>
        fmt === 'html' ? state.html : state.md

  test('no corruption occurs across the full html→md switch sequence', () => {
    const editor: EditorState = {
      html: '<p>Hello <strong>world</strong></p>',
      md: 'Hello **world**',
    }

    // ── Frame A: handleFormatChange fires ─────────────────────────────────
    // pendingFormatChangeRef.current is set to true BEFORE setActiveFormat.
    let pending = true

    // ── Frame B: intermediate render ─────────────────────────────────────
    // activeFormat = 'markdown', value = stale HTML (parent hasn't caught up)
    const editorContentB = read(editor)('markdown') // 'Hello **world**'
    const valueB = '<p>Hello <strong>world</strong></p>' // stale
    const syncB = shouldSyncToEditor(editorContentB, valueB, pending)
    expect(syncB).toBe(false) // guard prevents the spurious setContent call
    pending = false            // flag cleared after effect runs

    // ── Frame C: parent catches up ────────────────────────────────────────
    // activeFormat = 'markdown', value = 'Hello **world**'
    const editorContentC = read(editor)('markdown') // 'Hello **world**'
    const valueC = 'Hello **world**'
    const syncC = shouldSyncToEditor(editorContentC, valueC, pending)
    expect(syncC).toBe(false) // content already correct, no sync needed
  })

  test('external reset still triggers sync after a format switch', () => {
    const editor: EditorState = { html: '<p>A</p>', md: 'A' }
    const pending = false // no format change, just a form reset

    const editorContent = read(editor)('html')
    const externalReset = '<p>Reset value</p>'
    const sync = shouldSyncToEditor(editorContent, externalReset, pending)
    expect(sync).toBe(true)
  })
})
