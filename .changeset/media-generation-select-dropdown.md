---
'@modern-admin/react': patch
'@modern-admin/i18n': patch
---

Replace the native `<select>` elements in the media generation form (model +
enum params) with the Radix `Select` dropdown so they match the rest of the
kit and the chevron sits inside the trigger padding instead of jamming against
the edge. Adds a `common:none` string for an optional param's "unset" choice
(Radix forbids an empty-string item value, so it rides a sentinel).
