---
'@modern-admin/react': minor
---

`RelatedRecordsTabs`: keep the Export button in the embedded list toolbar. Each related-records tab can now download its rows as CSV/JSON through the usual export dialog; `ResourceListPage` merges the tab's locked foreign-key filter into the query it hands the dialog, so the file holds only the open record's related rows (and the embedded `Query:` preamble documents the filter).
