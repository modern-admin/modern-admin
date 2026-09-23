---
'@modern-admin/react': patch
'@modern-admin/ui': patch
---

Wrap unbreakable record values instead of letting them overflow the card. Values with no break opportunity (api keys, hashes, urls without hyphens, pasted long words) ran past the container on narrow viewports and were clipped: show-view text, textarea values, the rich-text body and reference badges now use `wrap-anywhere`.
