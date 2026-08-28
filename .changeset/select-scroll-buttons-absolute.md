---
'@modern-admin/ui': patch
---

Stop the `Select` dropdown from reserving a permanent 24px slot above the first
and below the last option. The scroll chevrons are now absolutely positioned
overlays that Radix only mounts while the list can scroll, so short lists no
longer render large empty gaps and the list still doesn't jump when the buttons
appear/disappear mid-scroll.
