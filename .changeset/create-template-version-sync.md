---
"@modern-admin/create": patch
---

Scaffold template no longer hardcodes `@modern-admin/*` dependency versions
(previously stuck at `^0.1.0`, a line with the known recordsTag crash). The
template now carries a `^{{modernAdminVersion}}` token and the CLI substitutes
its own package version at scaffold time, so `bun create @modern-admin` always
pins the current release line. Guarded by tests in `test/template.test.ts`.
