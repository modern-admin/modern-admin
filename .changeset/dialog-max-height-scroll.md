---
'@modern-admin/ui': patch
---

Cap `DialogContent` height at the viewport (`max-h-[calc(100dvh-2rem)]`) and
scroll overflow instead of clipping it. Tall modals (e.g. the media generation
form) previously rendered content below the fold with no way to reach it. The
close button is pinned above the scrolled content, and call-sites can still
override `max-h`/`overflow`/padding via `className` (command palette, chart
builder).
