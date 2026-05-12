# UI Components

`@modern-admin/ui` is the shared component library for Modern Admin. It is built on
[shadcn/ui](https://ui.shadcn.com/) primitives (Radix UI), [Tailwind CSS 4](https://tailwindcss.com/),
and [Lucide React](https://lucide.dev/) icons.

All components are **i18n-unaware by design** — they accept an optional `labels?: { … }` prop
with English fallback defaults so they work standalone in tests and Storybook.
The `packages/react` layer is the translation boundary: it calls `t('ns:key')` and passes
the result via `labels` (or named props) to each component.

---

## Button

A versatile click target with six semantic variants and four sizes.

```tsx
import { Button } from '@modern-admin/ui'

<Button variant="default" size="default">Save</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline" size="sm">Cancel</Button>
<Button variant="ghost" size="icon" aria-label="Settings">
  <SettingsIcon />
</Button>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'default' \| 'destructive' \| 'outline' \| 'secondary' \| 'ghost' \| 'link'` | `'default'` | Visual style |
| `size` | `'default' \| 'sm' \| 'lg' \| 'icon'` | `'default'` | Height and padding |
| `asChild` | `boolean` | `false` | Renders the child element instead of a `<button>` (Radix Slot) |
| `disabled` | `boolean` | — | Native disabled; removes pointer events and reduces opacity |

All standard `ButtonHTMLAttributes` are forwarded to the underlying element.

### Variants

| Variant | Use case |
|---------|----------|
| `default` | Primary action (filled, brand color) |
| `destructive` | Irreversible/delete actions |
| `outline` | Secondary action alongside a primary |
| `secondary` | Alternative emphasis — muted background |
| `ghost` | Toolbar controls; no background until hover |
| `link` | Inline text link appearance |

### Sizes

| Size | Height | Padding | Notes |
|------|--------|---------|-------|
| `default` | `h-9` | `px-4 py-2` | Standard form/page buttons |
| `sm` | `h-8` | `px-3` | Compact contexts |
| `lg` | `h-10` | `px-6` | Hero / call-to-action |
| `icon` | `h-9 w-9` | — | Square; holds a single icon |

SVG children are automatically sized to `size-4` and get `pointer-events-none`.

---

## Input

A styled `<input>` element. Spins its native step arrows on `type="number"` and hides
the system-default spinner (spinner is hidden via CSS).

```tsx
import { Input } from '@modern-admin/ui'

<Input type="text" placeholder="Search…" />
<Input type="number" value={count} onChange={e => setCount(+e.target.value)} />
```

All `InputHTMLAttributes` are forwarded. Combine with the `Field` components for
accessible label / error display.

---

## Select

A Radix-based compound component for styled `<select>` behaviour with keyboard navigation,
plus a lightweight `NativeSelect` fallback for simple contexts.

```tsx
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@modern-admin/ui'

<Select value={role} onValueChange={setRole}>
  <SelectTrigger>
    <SelectValue placeholder="Choose a role…" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="admin">Admin</SelectItem>
    <SelectItem value="editor">Editor</SelectItem>
    <SelectItem value="viewer">Viewer</SelectItem>
  </SelectContent>
</Select>
```

### NativeSelect

A thin `<select>` wrapper that inherits the same border / focus ring styles as `Input`.
Useful inside tables or when Radix's portal causes layout issues.

```tsx
import { NativeSelect } from '@modern-admin/ui'

<NativeSelect value={status} onChange={e => setStatus(e.target.value)}>
  <option value="active">Active</option>
  <option value="inactive">Inactive</option>
</NativeSelect>
```

---

## DatePicker

A popover-driven date or datetime input. The trigger is a real text `<input>` so users can
type directly; clicking the trailing calendar icon opens a calendar popover.

```tsx
import { DatePicker } from '@modern-admin/ui'

// Date only
<DatePicker value={date} onChange={setDate} />

// Date + time
<DatePicker value={datetime} onChange={setDatetime} mode="datetime" />
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string \| null \| undefined` | — | ISO date (`yyyy-MM-dd`) or datetime (`yyyy-MM-ddTHH:mm`) |
| `onChange` | `(next: string) => void` | — | Called with ISO string on every valid change |
| `mode` | `'date' \| 'datetime'` | `'date'` | Enables the time input below the calendar |
| `disabled` | `boolean` | — | Disables both the input and popover trigger |
| `placeholder` | `string` | `'YYYY-MM-DD'` or `'YYYY-MM-DD HH:MM'` | Input placeholder |
| `ariaLabel` | `string` | — | ARIA label for the text input |
| `openCalendarLabel` | `string` | `'Open calendar'` | ARIA label for the calendar icon button |
| `timeLabel` | `string` | `'Time'` | Label next to the time `<input>` in `datetime` mode |

### I/O contract

- Input `value` and emitted strings use `yyyy-MM-dd` for `mode="date"` and
  `yyyy-MM-dd'T'HH:mm` for `mode="datetime"` — the same format as `<input type="date">` /
  `<input type="datetime-local">`.
- If the user clears the input, `onChange('')` is called.
- The component tolerates manual typing in several formats and snaps back to the
  canonical form on blur.

---

## Combobox

A free-text autocomplete input. Unlike a `<Select>`, the typed value is accepted as-is even
if it doesn't match any suggestion. Suggestions are advisory and filtered client-side.

```tsx
import { Combobox } from '@modern-admin/ui'

<Combobox
  value={country}
  onChange={setCountry}
  suggestions={['France', 'Germany', 'Spain', { value: 'US', label: 'United States' }]}
  placeholder="Type a country…"
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | — | Controlled input value |
| `onChange` | `(next: string) => void` | — | Called on keystrokes and suggestion picks |
| `onBlur` | `() => void` | — | Called when the input loses focus |
| `suggestions` | `ReadonlyArray<string \| { value: string; label: string }>` | — | Suggestion list |
| `loading` | `boolean` | — | Shows a spinner while suggestions are being fetched |
| `disabled` | `boolean` | — | Disables the input |
| `placeholder` | `string` | — | — |
| `maxItems` | `number` | `50` | Max suggestions rendered after filtering |
| `labels` | `ComboboxLabels` | — | Translated UI strings |

### ComboboxLabels

| Key | Default |
|-----|---------|
| `loading` | `'Loading…'` |
| `noMatches` | `'No matches — press Enter to keep "{value}".'` |
| `toggleSuggestions` | `'Toggle suggestions'` |

`{value}` in `noMatches` is replaced with the current typed value at render time.

### Keyboard navigation

- `↓ / ↑` — move highlight through the suggestion list
- `Enter` — commit the highlighted suggestion (or keep the typed value if nothing is highlighted)
- `Escape` — close the suggestion panel

---

## PasswordInput

An `<input type="password">` with a trailing show/hide toggle button.

```tsx
import { PasswordInput } from '@modern-admin/ui'

<PasswordInput
  value={password}
  onChange={e => setPassword(e.target.value)}
  toggleLabel="Show/hide password"
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `toggleLabel` | `string` | `'Show/hide'` | ARIA label for the eye-icon button |

All `InputHTMLAttributes` are forwarded to the underlying `<input>`.

---

## FileInput

A styled single-file picker with optional drag-and-drop, current-file display, image
thumbnail preview, upload progress bar, and a remove button.

```tsx
import { FileInput } from '@modern-admin/ui'

<FileInput
  value={storageKey}
  displayName="avatar.png"
  previewUrl="https://example.com/avatar.png"
  accept="image/*"
  onFileSelect={file => uploadFile(file)}
  onRemove={() => clearFile()}
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string \| null` | — | Current storage key or URL |
| `displayName` | `string \| null` | — | Human-readable filename shown in the file row |
| `previewUrl` | `string \| null` | — | Public URL for image thumbnail preview |
| `accept` | `string` | — | HTML `accept` attribute (e.g. `'image/*'`, `'.pdf,.docx'`) |
| `uploading` | `boolean` | `false` | Shows a spinner and disables interaction |
| `uploadProgress` | `number` | — | `0–100`; replaces spinner with a determinate progress bar |
| `uploadingName` | `string` | — | Filename shown next to the upload spinner |
| `error` | `string` | — | Error message displayed below the drop zone |
| `disabled` | `boolean` | `false` | Prevents picking or removing |
| `onFileSelect` | `(file: File) => void` | — | Called when the user picks a new file |
| `onRemove` | `() => void` | — | Called when the user clicks the remove button |
| `labels` | `FileInputLabels` | — | Translated UI strings |

### FileInputLabels

| Key | Default |
|-----|---------|
| `chooseFile` | `'Choose file'` |
| `dragAndDrop` | `'Drag and drop or'` |
| `chooseAFile` | `'choose a file'` |
| `uploading` | `'Uploading…'` |
| `uploadingFile` | `'Uploading {name}…'` |
| `removeFile` | `'Remove file'` |

`{name}` in `uploadingFile` is replaced with `uploadingName` at render time.

---

## MultiFileInput

Like `FileInput` but operates on an array of files. Renders a list of attached files and
a separate list of in-progress uploads with per-item status.

```tsx
import { MultiFileInput } from '@modern-admin/ui'

<MultiFileInput
  items={attachments}
  pendingItems={uploads}
  onFilesSelect={files => uploadAll(files)}
  onRemove={key => removeAttachment(key)}
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `items` | `ReadonlyArray<MultiFileInputItem>` | — | Currently attached files |
| `pendingItems` | `ReadonlyArray<MultiFileInputPendingItem>` | `[]` | In-progress uploads |
| `accept` | `string` | — | HTML `accept` attribute |
| `disabled` | `boolean` | — | — |
| `onFilesSelect` | `(files: File[]) => void` | — | Called with the array of picked files |
| `onRemove` | `(value: string) => void` | — | Called with the storage key of the file to remove |
| `onDismissError` | `(id: string) => void` | — | Called when the user dismisses a pending error row |
| `labels` | `MultiFileInputLabels` | — | Translated UI strings |

### MultiFileInputItem

```ts
interface MultiFileInputItem {
  value: string        // storage key or URL
  previewUrl?: string  // thumbnail for images
  displayName?: string // human-readable name
}
```

### MultiFileInputPendingItem

```ts
interface MultiFileInputPendingItem {
  id: string                                   // stable row key
  name: string                                 // display name
  progress?: number                            // 0–100
  status?: 'queued' | 'uploading' | 'error'
  error?: string                               // shown when status === 'error'
}
```

---

## RichtextEditor

A Tiptap 3-based WYSIWYG editor with a full formatting toolbar, source/split view toggle,
fullscreen mode, and HTML/Markdown format switching.

```tsx
import { RichtextEditor } from '@modern-admin/ui'

<RichtextEditor
  value={html}
  onChange={setHtml}
  format="html"
/>

// Markdown mode
<RichtextEditor
  value={markdown}
  onChange={setMarkdown}
  format="markdown"
  defaultMode="wysiwyg"
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | — | HTML or Markdown string depending on `format` |
| `onChange` | `(value: string) => void` | — | Called on every edit |
| `format` | `'html' \| 'markdown'` | `'html'` | I/O contract for `value` |
| `defaultMode` | `'wysiwyg' \| 'source' \| 'split'` | `'wysiwyg'` | Initial view mode |
| `placeholder` | `string` | — | Shown while the editor is empty |
| `disabled` | `boolean` | — | Makes the editor read-only and dims the toolbar |
| `onBlur` | `() => void` | — | Called when focus leaves the editor |
| `ariaLabelledBy` | `string` | — | `id` of the associated `<label>` element |
| `labels` | `RichtextEditorLabels` | — | Translated toolbar tooltip strings |
| `className` | `string` | — | Extra classes on the root wrapper |

### View modes

| Mode | Description |
|------|-------------|
| `wysiwyg` | WYSIWYG editor only |
| `source` | Raw text/markdown textarea only |
| `split` | Textarea + WYSIWYG side-by-side (fullscreen only) |

### Toolbar

The toolbar provides: **Bold**, **Italic**, **Strikethrough**, **Inline code**, **Headings 1–3**,
**Bullet list**, **Numbered list**, **Blockquote**, **Horizontal rule**, **Insert link**,
**Undo/Redo**, a HTML/MD format switcher, view-mode buttons, and a fullscreen toggle.

All toolbar buttons surface accessible labels via `RichtextEditorLabels`.

### RichtextEditorLabels

| Key | Default | Notes |
|-----|---------|-------|
| `bold` | `'Bold'` | |
| `italic` | `'Italic'` | |
| `strikethrough` | `'Strikethrough'` | |
| `inlineCode` | `'Inline code'` | |
| `heading` | `'Heading {level}'` | `{level}` → 1/2/3 |
| `bulletList` | `'Bullet list'` | |
| `numberedList` | `'Numbered list'` | |
| `blockquote` | `'Blockquote'` | |
| `horizontalRule` | `'Horizontal rule'` | |
| `insertLink` | `'Insert link'` | |
| `undo` | `'Undo'` | |
| `redo` | `'Redo'` | |
| `source` | `'Source ({format})'` | `{format}` → `'html'`/`'md'` |
| `splitView` | `'Split view'` | |
| `visualEditor` | `'Visual editor'` | |
| `fullscreen` | `'Fullscreen'` | |
| `exitFullscreen` | `'Exit fullscreen'` | |
| `urlPrompt` | `'URL'` | Prompt for the link URL dialog |

---

## KeyValueEditor / KeyValueView

A friendly alternative to `JsonEditor` for JSON columns with a **fixed** set of keys.
Renders one labelled row per declared key with an appropriate input control — no braces or
quotes visible to the user.

```tsx
import { KeyValueEditor, KeyValueView } from '@modern-admin/ui'

const fields = [
  { key: 'locale', label: 'Locale', type: 'select', availableValues: ['en', 'de', 'fr'] },
  { key: 'featured', label: 'Featured', type: 'boolean' },
  { key: 'priority', label: 'Priority', type: 'number' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]

// Edit
<KeyValueEditor value={jsonObj} onChange={setJsonObj} fields={fields} />

// Read-only
<KeyValueView value={jsonObj} fields={fields} />
```

### KeyValueEditor props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `Record<string, unknown> \| null` | — | The JSON object being edited |
| `onChange` | `(next: Record<string, unknown>) => void` | — | Called on every field change |
| `fields` | `KeyValueFieldSpec[]` | — | Declared keys with editor configuration |
| `disabled` | `boolean` | — | Disables all inputs |
| `labels` | `KeyValueEditorLabels` | — | Translated UI strings |

### KeyValueFieldSpec

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `key` | `string` | — | JSON key on the underlying object |
| `label` | `string` | `key` | Visible row label |
| `type` | `KeyValueFieldType` | `'string'` | Editor kind |
| `description` | `string` | — | Helper text below the input |
| `placeholder` | `string` | — | Placeholder for text/number inputs |
| `isRequired` | `boolean` | — | Visual `*` marker |
| `availableValues` | `Array<string \| { value, label }>` | — | Options for `select` / suggestions for `autocomplete` |

### Field types

| Type | Rendered as |
|------|-------------|
| `string` | Text `<Input>` |
| `number` | Number `<Input>` |
| `boolean` | `<Switch>` |
| `textarea` | `<Textarea>` |
| `select` | `<Select>` with `availableValues` as options |
| `autocomplete` | `<Combobox>` with `availableValues` as suggestions |

---

## JsonEditor / JsonView

A raw JSON editor backed by a monospace `<Textarea>` with live parse validation, a "Format"
button for pretty-printing, and an inline error display.

```tsx
import { JsonEditor, JsonView } from '@modern-admin/ui'

// Edit
<JsonEditor
  value={jsonValue}
  onChange={setJsonValue}
  formatLabel="Format"
  invalidLabel="Invalid JSON:"
/>

// Read-only (pretty-printed)
<JsonView value={jsonValue} />

// Inline / collapsed (for list views)
<JsonView value={jsonValue} variant="inline" />
```

### JsonEditor props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `unknown` | — | The structured value (object, array, primitive) |
| `onChange` | `(next: unknown) => void` | — | Called with the **parsed** value on valid input |
| `onBlur` | `() => void` | — | — |
| `disabled` | `boolean` | — | — |
| `placeholder` | `string` | — | — |
| `rows` | `number` | — | Textarea row count |
| `formatLabel` | `string` | `'Format'` | Label for the "pretty-print" button |
| `invalidLabel` | `string` | `'Invalid JSON:'` | Prefix for parse-error messages |

`onChange` is only called when the textarea content is valid JSON. While the user is typing
an invalid string the editor holds the draft locally and shows an error banner.

---

## DiffView

Renders a before/after comparison of two JSON-serializable values with color-coded
field-by-field changes.

```tsx
import { DiffView } from '@modern-admin/ui'

<DiffView before={previousRecord} after={currentRecord} />
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `before` | `Record<string, unknown> \| null` | — | Previous state |
| `after` | `Record<string, unknown> \| null` | — | Current state |
| `className` | `string` | — | Extra classes on the root element |

Fields present only in `before` are shown in red (removed). Fields present only in `after`
are shown in green (added). Fields that changed show both the old and new value.
Unchanged fields are hidden.

---

## MediaPreview

Auto-detects whether a URL points to an image, video, or audio file (via a `HEAD` request)
and renders the appropriate player/viewer. Falls back to a download link.

```tsx
import { MediaPreview } from '@modern-admin/ui'

<MediaPreview
  url="https://cdn.example.com/uploads/photo.jpg"
  filename="photo.jpg"
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `url` | `string` | — | Public URL of the media file |
| `filename` | `string` | — | Display name for the download link |
| `className` | `string` | — | — |

The component renders nothing (empty fragment) when `url` is empty.

---

## AuditTimeline

Renders an ordered list of audit log events — each with a timestamp, actor, action type,
and optional diff.

```tsx
import { AuditTimeline } from '@modern-admin/ui'

<AuditTimeline entries={auditEntries} />
```

### AuditEntry shape

```ts
interface AuditEntry {
  id: string
  timestamp: string     // ISO string
  actor?: string        // display name of the user who performed the action
  action: string        // e.g. 'create', 'update', 'delete'
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}
```

---

## RevisionTimeline

Renders a list of historical record revisions with selectable items. Clicking an item
notifies the parent so it can display the selected snapshot.

```tsx
import { RevisionTimeline } from '@modern-admin/ui'

<RevisionTimeline
  revisions={revisions}
  selectedId={selectedRevisionId}
  onSelect={setSelectedRevisionId}
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `revisions` | `RevisionItem[]` | — | Ordered list of revision snapshots |
| `selectedId` | `string` | — | Currently selected revision id |
| `onSelect` | `(id: string) => void` | — | Called when the user picks a revision |

---

## Empty state

A set of composable sub-components for building consistent empty-state screens.

```tsx
import { Empty, EmptyMedia, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@modern-admin/ui'

<Empty>
  <EmptyMedia>
    <InboxIcon className="size-8 text-muted-foreground" />
  </EmptyMedia>
  <EmptyHeader>
    <EmptyTitle>No records yet</EmptyTitle>
    <EmptyDescription>Create your first record to get started.</EmptyDescription>
  </EmptyHeader>
  <EmptyContent>
    <Button>Create record</Button>
  </EmptyContent>
</Empty>
```

### Sub-components

| Component | Renders as | Description |
|-----------|-----------|-------------|
| `Empty` | `<div>` | Centered flex column wrapper |
| `EmptyMedia` | `<div>` | Icon/illustration area |
| `EmptyHeader` | `<div>` | Groups title + description |
| `EmptyTitle` | `<h3>` | Primary heading |
| `EmptyDescription` | `<p>` | Secondary body text |
| `EmptyContent` | `<div>` | Actions or supplementary content |

---

## Field

Accessible form field wrapper. Pairs an `<input>` (or any control) with a `<label>`,
optional description, and validation error message.

```tsx
import { Field, FieldLabel, FieldDescription, FieldError } from '@modern-admin/ui'

<Field>
  <FieldLabel htmlFor="email">Email</FieldLabel>
  <Input id="email" type="email" value={email} onChange={…} />
  <FieldDescription>We'll never share your email.</FieldDescription>
  {error && <FieldError>{error}</FieldError>}
</Field>
```

### Sub-components

| Component | Renders as | Description |
|-----------|-----------|-------------|
| `Field` | `<div>` | Vertical stack for a single field |
| `FieldLabel` | `<label>` | Accessible label; required `*` marker via `required` prop |
| `FieldDescription` | `<p>` | Helper text (muted, small) |
| `FieldError` | `<p>` | Validation error (destructive color, `role="alert"`) |
| `FieldGroup` | `<div>` | Horizontal group of related inputs (e.g. first + last name) |
| `FieldSet` | `<fieldset>` | Groups multiple related fields |
| `FieldLegend` | `<legend>` | Title for a `FieldSet` |
| `FieldSeparator` | `<hr>` | Visual separator between field sections |
| `FieldContent` | `<div>` | Right-aligned supplementary content (e.g. "Forgot password?" link) |

---

## Dialog

A compound component set for modal dialogs built on Radix UI.

```tsx
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter, DialogClose
} from '@modern-admin/ui'

<Dialog>
  <DialogTrigger asChild>
    <Button>Open</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Confirm deletion</DialogTitle>
      <DialogDescription>This action cannot be undone.</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <DialogClose asChild>
        <Button variant="outline">Cancel</Button>
      </DialogClose>
      <Button variant="destructive" onClick={handleDelete}>Delete</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Sub-components

| Component | Description |
|-----------|-------------|
| `Dialog` | Root state provider |
| `DialogTrigger` | Element that opens the dialog |
| `DialogContent` | Overlay panel; includes an accessible close button |
| `DialogHeader` | Padded area for title and description |
| `DialogTitle` | Accessible dialog title |
| `DialogDescription` | Supplementary description (screen-reader visible) |
| `DialogFooter` | Action button row |
| `DialogClose` | Element that closes the dialog (use `asChild` for custom triggers) |

---

## Utility: `cn`

All components accept a `className` prop that is merged via the `cn` utility (a wrapper
around `clsx` + `tailwind-merge`). Use it in your own components to merge Tailwind classes
without specificity conflicts:

```ts
import { cn } from '@modern-admin/ui'

cn('px-4 py-2 rounded', isActive && 'bg-primary text-white', className)
```
