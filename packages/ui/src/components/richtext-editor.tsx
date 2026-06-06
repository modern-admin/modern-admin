// Tiptap-3-based WYSIWYG editor with a Source/Plain toggle.
//
//   <RichtextEditor value={value} onChange={onChange} format="html" />
//
// `format` controls both the I/O contract (HTML vs Markdown) and the
// content of the Source view: when format='markdown' the editor uses the
// `tiptap-markdown` extension and `value` is the raw Markdown string;
// when format='html' the value is the editor's serialised HTML.

import * as React from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import {
  Bold,
  Code,
  Code2,
  Columns2,
  Eye,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from 'lucide-react'
import { cn } from '../lib/utils.js'
import { Button } from './button.js'
import {
  isSplitAvailable,
  resolveMode,
  shouldSyncEditor,
  type RichtextMode,
} from './richtext-mode.js'
import { readEditorContent, shouldSyncToEditor } from './richtext-sync.js'
import { Separator } from './separator.js'
import { Textarea } from './textarea.js'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip.js'

export type RichtextFormat = 'html' | 'markdown'

export interface RichtextEditorLabels {
  bold?: string
  italic?: string
  strikethrough?: string
  inlineCode?: string
  /** Template — `{level}` is replaced with 1/2/3. Default: "Heading {level}". */
  heading?: string
  bulletList?: string
  numberedList?: string
  blockquote?: string
  horizontalRule?: string
  insertLink?: string
  undo?: string
  redo?: string
  /** Template — `{format}` is replaced with "html"/"md". Default: "Source ({format})". */
  source?: string
  splitView?: string
  visualEditor?: string
  fullscreen?: string
  exitFullscreen?: string
  /** Prompt text for link URL input. Default: "URL". */
  urlPrompt?: string
}

export interface RichtextEditorProps {
  value: string
  onChange(value: string): void
  format?: RichtextFormat
  placeholder?: string
  disabled?: boolean
  /** Initial mode of the editor. Defaults to 'wysiwyg'. */
  defaultMode?: RichtextMode
  className?: string
  /** Called when the editor blurs. Useful for RHF onBlur. */
  onBlur?(): void
  ariaLabelledBy?: string
  /** Translated toolbar labels. All optional — English strings are the defaults. */
  labels?: RichtextEditorLabels
}

const HEADING_ICON: Record<1 | 2 | 3, React.ComponentType<{ className?: string }>> = {
  1: Heading1,
  2: Heading2,
  3: Heading3,
}

const proseContentClass =
  'prose prose-sm max-w-none min-h-[160px] p-3 text-foreground focus:outline-none ' +
  'prose-headings:scroll-mt-20 prose-headings:text-foreground prose-p:text-foreground ' +
  'prose-strong:text-foreground prose-li:text-foreground prose-code:text-foreground ' +
  'prose-pre:text-foreground prose-pre:bg-muted prose-blockquote:text-muted-foreground ' +
  'prose-blockquote:border-border prose-a:text-foreground dark:prose-invert'

function ToolbarButton({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean
  disabled?: boolean
  onClick(): void
  title: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? 'secondary' : 'ghost'}
          size="icon"
          className="size-8"
          aria-pressed={active}
          aria-label={title}
          disabled={disabled}
          onMouseDown={(e) => {
            // Prevent blur of the editor selection
            e.preventDefault()
          }}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  )
}


export function RichtextEditor({
  value,
  onChange,
  format = 'html',
  placeholder,
  disabled,
  defaultMode = 'wysiwyg',
  className,
  onBlur,
  ariaLabelledBy,
  labels,
}: RichtextEditorProps): React.ReactElement {
  const l = {
    bold: labels?.bold ?? 'Bold',
    italic: labels?.italic ?? 'Italic',
    strikethrough: labels?.strikethrough ?? 'Strikethrough',
    inlineCode: labels?.inlineCode ?? 'Inline code',
    heading: labels?.heading ?? 'Heading {level}',
    bulletList: labels?.bulletList ?? 'Bullet list',
    numberedList: labels?.numberedList ?? 'Numbered list',
    blockquote: labels?.blockquote ?? 'Blockquote',
    horizontalRule: labels?.horizontalRule ?? 'Horizontal rule',
    insertLink: labels?.insertLink ?? 'Insert link',
    undo: labels?.undo ?? 'Undo',
    redo: labels?.redo ?? 'Redo',
    source: labels?.source ?? 'Source ({format})',
    splitView: labels?.splitView ?? 'Split view',
    visualEditor: labels?.visualEditor ?? 'Visual editor',
    fullscreen: labels?.fullscreen ?? 'Fullscreen',
    exitFullscreen: labels?.exitFullscreen ?? 'Exit fullscreen',
    urlPrompt: labels?.urlPrompt ?? 'URL',
  }
  const [mode, setMode] = React.useState<RichtextMode>(defaultMode)
  const [fullscreen, setFullscreen] = React.useState(false)
  // Effective mode: collapses 'split' to 'wysiwyg' when not fullscreen so the
  // layout stays usable.  The user's chosen mode is preserved in `mode` so that
  // re-entering fullscreen restores split.
  const effectiveMode = resolveMode(mode, fullscreen)
  // Currently active output format. Initial value comes from `format` prop;
  // user can override via the toolbar HTML/MD switch. The prop acts as the
  // controlled default — when it changes externally, sync local state.
  const [activeFormat, setActiveFormat] = React.useState<RichtextFormat>(format)
  React.useEffect(() => {
    setActiveFormat(format)
  }, [format])

  // Stable ref so onUpdate (registered once with the editor) always reads the
  // latest active format without recreating the editor instance.
  const activeFormatRef = React.useRef(activeFormat)
  React.useEffect(() => {
    activeFormatRef.current = activeFormat
  }, [activeFormat])

  // Set to true inside handleFormatChange and cleared after the first sync
  // effect run. Guards against the intermediate render where activeFormat has
  // already changed to the new format but the external `value` prop still
  // holds the previous format's string (parent hasn't re-rendered yet).
  // Without this guard, the stale value would be written into the editor in
  // the wrong format, corrupting the content.
  const pendingFormatChangeRef = React.useRef(false)

  // Tracks the most recent string we emitted via onChange. The sync effect
  // uses it to detect "echoes" — frames where parent's value caught up to a
  // previous onChange while the user has *already* typed more characters. In
  // that frame editor.getHTML() is ahead of value; without echo-suppression
  // we'd call setContent(value), reverting the editor to the stale string,
  // dropping just-typed characters and jumping the cursor. See the
  // "echo-suppression" tests in richtext-sync.test.ts for the full timeline.
  const lastEmittedRef = React.useRef(value)

  // Markdown extension is always loaded so the editor can produce both HTML
  // and Markdown on demand without a costly remount when the user toggles.
  const extensions = React.useMemo(
    () => [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      // html: true (the library default) is required so that MarkdownIt
      // recognises HTML blocks when setContent() is called with an HTML string
      // (format='html'). With html:false, tags like <p>/<h2>/<strong> are
      // treated as literal characters and displayed as raw text instead of
      // being rendered. The markdown *output* (getMarkdown) is still clean
      // markdown for all standard nodes — html:true only affects input parsing.
      Markdown.configure({ html: true, transformPastedText: true }) as never,
    ],
    [],
  )

  const editor = useEditor(
    {
      extensions,
      content: value,
      editable: !disabled,
      editorProps: {
        attributes: {
          class: cn(
            proseContentClass,
          ),
          'aria-labelledby': ariaLabelledBy ?? '',
        },
      },
      onUpdate: ({ editor: ed }) => {
        const next = readEditorContent(ed, activeFormatRef.current)
        lastEmittedRef.current = next
        onChange(next)
      },
      onBlur: () => onBlur?.(),
      // Tiptap 3 ships with default content sync; no need for autofocus etc.
      immediatelyRender: false,
    },
    [disabled, ariaLabelledBy],
  )

  // Keep editor in sync when external `value` changes (e.g. form reset).
  // shouldSyncToEditor guards against the intermediate render that follows a
  // format switch: activeFormat has changed but value hasn't caught up yet.
  // In that transient frame, calling setContent with the stale value would
  // write the old format's string into the editor in the new format mode,
  // corrupting the content. pendingFormatChangeRef is set in handleFormatChange
  // and cleared here after the first effect invocation.
  React.useEffect(() => {
    if (!editor || !shouldSyncEditor(effectiveMode)) {
      pendingFormatChangeRef.current = false
      return
    }
    if (
      shouldSyncToEditor(
        readEditorContent(editor, activeFormat),
        value,
        pendingFormatChangeRef.current,
        lastEmittedRef.current,
      )
    ) {
      editor.commands.setContent(value, { emitUpdate: false })
      lastEmittedRef.current = value
    }
    pendingFormatChangeRef.current = false
  }, [editor, value, activeFormat, effectiveMode])

  const handleFormatChange = React.useCallback(
    (next: RichtextFormat) => {
      if (next === activeFormat) return
      // Set the guard BEFORE queueing the state update so the sync effect
      // skips the intermediate render where activeFormat='next' but value
      // still holds the previous format's string.
      pendingFormatChangeRef.current = true
      setActiveFormat(next)
      if (editor) {
        const emitted = readEditorContent(editor, next)
        lastEmittedRef.current = emitted
        onChange(emitted)
      }
    },
    [activeFormat, editor, onChange],
  )

  const switchToMode = React.useCallback(
    (next: RichtextMode) => {
      // When entering a mode that shows the editor, refresh its content from
      // value so any edits made in the source textarea (where the editor sync
      // was suppressed) become visible. Also update lastEmittedRef so the
      // upcoming sync effect treats the editor as authoritative.
      if (next !== 'source' && editor) {
        editor.commands.setContent(value, { emitUpdate: false })
        lastEmittedRef.current = value
      }
      setMode(next)
    },
    [editor, value],
  )

  const toggleFullscreen = React.useCallback(() => {
    setFullscreen((v) => !v)
  }, [])

  // Exit fullscreen on Escape, and lock body scroll while fullscreen.
  React.useEffect(() => {
    if (!fullscreen || typeof window === 'undefined') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setFullscreen(false)
      }
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [fullscreen])

  const promptLink = React.useCallback(() => {
    if (!editor) return
    const prev = (editor.getAttributes('link')?.href as string) ?? ''
    const url = typeof window !== 'undefined' ? window.prompt(l.urlPrompt, prev) : null
    if (url == null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetMark('link').run()
      return
    }
    // Tiptap 3's StarterKit doesn't ship Link by default; it's only available
    // when the Link extension is included. Fall back to no-op if not present.
    const chain = editor.chain().focus().extendMarkRange('link') as ReturnType<
      typeof editor.chain
    > & { setLink?: (a: { href: string }) => unknown }
    if (typeof chain.setLink === 'function') {
      chain.setLink({ href: url }).run()
    }
  }, [editor, l.urlPrompt])

  if (!editor) {
    return (
      <div
        className={cn(
          'rounded-md border border-input bg-background text-sm text-muted-foreground',
          className,
        )}
      >
        <div className="p-3">{placeholder ?? ''}</div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-md border border-input bg-background shadow-sm',
        disabled && 'opacity-50',
        fullscreen && 'fixed inset-0 z-50 flex flex-col rounded-none border-0 shadow-none',
        className,
      )}
    >
      {/* Toolbar */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-0.5 border-b border-border p-1',
          fullscreen && 'shrink-0 bg-background',
        )}
      >
        <ToolbarButton
          title={l.bold}
          active={editor.isActive('bold')}
          disabled={effectiveMode === 'source' || disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          title={l.italic}
          active={editor.isActive('italic')}
          disabled={effectiveMode === 'source' || disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          title={l.strikethrough}
          active={editor.isActive('strike')}
          disabled={effectiveMode === 'source' || disabled}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          title={l.inlineCode}
          active={editor.isActive('code')}
          disabled={effectiveMode === 'source' || disabled}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code className="size-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="mx-0.5 h-6" />

        {([1, 2, 3] as const).map((level) => {
          const Icon = HEADING_ICON[level]
          return (
            <ToolbarButton
              key={level}
              title={l.heading.replace('{level}', String(level))}
              active={editor.isActive('heading', { level })}
              disabled={effectiveMode === 'source' || disabled}
              onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
            >
              <Icon className="size-4" />
            </ToolbarButton>
          )
        })}

        <Separator orientation="vertical" className="mx-0.5 h-6" />

        <ToolbarButton
          title={l.bulletList}
          active={editor.isActive('bulletList')}
          disabled={effectiveMode === 'source' || disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          title={l.numberedList}
          active={editor.isActive('orderedList')}
          disabled={effectiveMode === 'source' || disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          title={l.blockquote}
          active={editor.isActive('blockquote')}
          disabled={effectiveMode === 'source' || disabled}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          title={l.horizontalRule}
          disabled={effectiveMode === 'source' || disabled}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          title={l.insertLink}
          active={editor.isActive('link')}
          disabled={effectiveMode === 'source' || disabled}
          onClick={promptLink}
        >
          <LinkIcon className="size-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="mx-0.5 h-6" />

        <ToolbarButton
          title={l.undo}
          disabled={effectiveMode === 'source' || !editor.can().undo() || disabled}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          title={l.redo}
          disabled={effectiveMode === 'source' || !editor.can().redo() || disabled}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="size-4" />
        </ToolbarButton>

        <div className="ml-auto" />

        {/* Format selector — picks the on-disk markup of the value. Switching
            re-emits the current editor content in the new format, so it can
            be used mid-editing without losing state. */}
        <div className="flex h-8 items-center overflow-hidden rounded-md border border-input">
          {(['html', 'markdown'] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={activeFormat === f}
              disabled={disabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleFormatChange(f)}
              className={cn(
                'h-full cursor-pointer px-2 text-xs font-medium uppercase transition-colors',
                activeFormat === f
                  ? 'bg-secondary text-secondary-foreground'
                  : 'bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                disabled && 'pointer-events-none opacity-50',
              )}
            >
              {f === 'html' ? 'HTML' : 'MD'}
            </button>
          ))}
        </div>

        <Separator orientation="vertical" className="mx-0.5 h-6" />

        {/* View-mode selector — three modes: source / split / wysiwyg.
            Split is only enabled in fullscreen since the side-by-side layout
            requires the full viewport width to be usable. */}
        <ToolbarButton
          title={l.source.replace('{format}', activeFormat)}
          active={effectiveMode === 'source'}
          disabled={disabled}
          onClick={() => switchToMode('source')}
        >
          <Code2 className="size-4" />
        </ToolbarButton>
        {/* Split button is hidden outside fullscreen — the side-by-side layout
            requires full viewport width to be usable, so a disabled button
            would just waste toolbar space. */}
        {isSplitAvailable(fullscreen) && (
          <ToolbarButton
            title={l.splitView}
            active={effectiveMode === 'split'}
            disabled={disabled}
            onClick={() => switchToMode('split')}
          >
            <Columns2 className="size-4" />
          </ToolbarButton>
        )}
        <ToolbarButton
          title={l.visualEditor}
          active={effectiveMode === 'wysiwyg'}
          disabled={disabled}
          onClick={() => switchToMode('wysiwyg')}
        >
          <Eye className="size-4" />
        </ToolbarButton>

        <ToolbarButton
          title={fullscreen ? l.exitFullscreen : l.fullscreen}
          active={fullscreen}
          onClick={toggleFullscreen}
        >
          {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </ToolbarButton>
      </div>

      {/* Body — three layouts driven by effectiveMode.
          - source: textarea only
          - wysiwyg: editor only
          - split: textarea (left) + editor (right), both bound to the same
            `value` so each pane stays in sync via onChange + the sync effect. */}
      {effectiveMode === 'source' ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onBlur?.()}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={false}
          className={cn(
            'w-full rounded-none border-0 font-mono text-xs shadow-none focus-visible:ring-0',
            fullscreen ? 'min-h-0 flex-1 resize-none' : 'min-h-[160px] resize-y',
          )}
        />
      ) : effectiveMode === 'split' ? (
        <div
          className={cn(
            'flex w-full',
            fullscreen ? 'min-h-0 flex-1' : 'min-h-[160px]',
          )}
        >
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => onBlur?.()}
            placeholder={placeholder}
            disabled={disabled}
            spellCheck={false}
            className={cn(
              'w-1/2 rounded-none border-0 font-mono text-xs shadow-none focus-visible:ring-0',
              fullscreen ? 'min-h-0 resize-none' : 'min-h-[160px] resize-none',
            )}
          />
          {/* Central divider — explicit fixed-width vertical bar so it's
              clearly visible against both panes' backgrounds. */}
          <div
            aria-hidden
            className="w-px shrink-0 self-stretch bg-border"
          />
          <EditorContent
            editor={editor}
            className={cn(
              'w-1/2 overflow-auto',
              disabled && 'pointer-events-none',
              fullscreen && 'min-h-0 [&_.ProseMirror]:min-h-full',
            )}
          />
        </div>
      ) : (
        <EditorContent
          editor={editor}
          className={cn(
            disabled && 'pointer-events-none',
            fullscreen && 'min-h-0 flex-1 overflow-auto [&_.ProseMirror]:min-h-full',
          )}
        />
      )}
    </div>
  )
}
