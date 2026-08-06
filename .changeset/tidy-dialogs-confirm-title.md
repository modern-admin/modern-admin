---
'@modern-admin/react': patch
'@modern-admin/i18n': patch
---

Confirm dialogs no longer default to the delete wording. A guarded custom action now shows a neutral "Confirm action" title with a "Confirm" button; only destructive confirms keep "Delete this record?" / "Delete". Adds `common:confirmAction` and `common:confirm` to every locale.
