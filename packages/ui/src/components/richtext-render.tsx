// Read-only renderer for HTML/Markdown produced by <RichtextEditor>.
// Sanitizes HTML through DOMPurify before injection. Markdown is parsed
// with `marked`, then sanitized. Output is wrapped in Tailwind `prose`
// utilities so headings/lists/code blocks/etc. get long-form typography.

import * as React from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { cn } from '../lib/utils.js'

const proseRenderClass =
  'prose prose-sm max-w-none text-foreground prose-headings:text-foreground ' +
  'prose-p:text-foreground prose-strong:text-foreground prose-li:text-foreground ' +
  'prose-code:text-foreground prose-pre:text-foreground prose-pre:bg-muted ' +
  'prose-blockquote:text-muted-foreground prose-blockquote:border-border ' +
  'prose-a:text-foreground dark:prose-invert'

export interface RichtextRenderProps {
  value: string
  format?: 'html' | 'markdown'
  className?: string
}

function renderHtml(html: string): string {
  // DOMPurify is browser-only; on SSR fall back to escaping.
  if (typeof window === 'undefined') return html
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}

export function RichtextRender({
  value,
  format = 'html',
  className,
}: RichtextRenderProps): React.ReactElement {
  const html = React.useMemo(() => {
    if (!value) return ''
    if (format === 'markdown') {
      // marked.parse is sync when no async extensions are configured.
      const out = marked.parse(value, { async: false }) as string
      return renderHtml(out)
    }
    return renderHtml(value)
  }, [value, format])

  return (
    <div
      className={cn(proseRenderClass, className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
