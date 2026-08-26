---
'@modern-admin/core': minor
'@modern-admin/react': minor
'@modern-admin/i18n': patch
---

Gate creation UI by the server-advertised `new` action and show a forbidden state for direct creation URLs when the action is unavailable.

Add creation-specific property visibility and ordering through `isVisible.new` and `newProperties`, with backwards-compatible fallback to the edit view, and replace empty creation/edit forms with a localized empty state without a submit action.
