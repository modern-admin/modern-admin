---
"@modern-admin/core": patch
---

Fixed `unflatten()` destroying JSON objects with numeric keys. `{ '6': …, '10': …, default: … }` was rebuilt as an array (the first numeric segment decided the container type), and the remaining non-numeric keys landed in `arr[NaN]` — properties `JSON.stringify()` drops, so the values were lost on save. The container type is now decided per path over all of its children: an array only when every sibling segment is an index.
