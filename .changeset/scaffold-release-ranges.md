---
'@modern-admin/create': patch
'@modern-admin/react': patch
---

Generate host dependencies from each framework package's prepared release version
instead of the CLI version, keeping independently versioned packages installable.
Synchronize the generator's version catalog during release preparation and use it
for custom UI setup defaults. Add leading action icons to the UI kit gallery.
