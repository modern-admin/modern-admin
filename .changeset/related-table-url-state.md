---
'@modern-admin/react': patch
---

Persist the active related-records tab and each related table's filters, pagination,
page size, and sorting in the record URL so they survive navigation back and reloads.
Keep locked parent filters authoritative over URL filters for related tables and exports.
