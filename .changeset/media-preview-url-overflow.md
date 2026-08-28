---
'@modern-admin/ui': patch
---

Fix the `MediaPreview` URL text overflowing its container on the show page. The
URL now renders on its own line under the "Preview" button, fills the available
width, and truncates in the **middle** (`http://…/thumb.png`) so both the origin
and the file name stay visible — instead of spilling past narrow columns or
clipping only the (most useful) tail. The full URL remains in a `title` tooltip.
