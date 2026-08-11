---
'@modern-admin/ui': patch
'@modern-admin/react': patch
---

fix(ui): keep floating layers usable on mobile

Floating content (Popover, Select, DropdownMenu incl. submenus, Tooltip) now
portals into the enclosing Dialog / AlertDialog / Sheet instead of
`document.body`. Radix wraps modal content in `react-remove-scroll`, which only
lets touch gestures through inside that subtree — a dropdown portaled to the
body rendered fine but could not be scrolled with a finger while the filter
sheet was open.

They also get a default `collisionPadding` that folds in the mobile browser's
visual-viewport insets (URL bar, on-screen keyboard), so a layer that flips
above its trigger no longer lands behind browser chrome, and they cap their
height to the available viewport space — the reference combobox and the column
filter popover now shrink their list instead of overflowing off-screen, keeping
the search field visible.
