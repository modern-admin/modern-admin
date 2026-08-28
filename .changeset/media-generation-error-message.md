---
'@modern-admin/react': patch
---

Show a human-readable message when media generation fails. The form now runs
server error bodies through `parseApiError` instead of surfacing the raw JSON
response (e.g. a `412` body was shown verbatim in the toast).
