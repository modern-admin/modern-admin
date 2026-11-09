---
'@modern-admin/ui': minor
'@modern-admin/react': minor
'@modern-admin/i18n': minor
'@modern-admin/nest': patch
---

Complete the UI kit with semantic status and chart colors, accessible composite
fields, React 19 ref props, and shared alert, spinner/loading-button, pagination,
radio/toggle group, input group, progress, slider, hover card and button group
components. Replace duplicated controls in React and add a localized component
gallery, interaction tests and automated accessibility checks.

Preserve external slider labels and focus invalid many-to-many fields through
both picker variants, including their validation descriptions.

Theme migration: color tokens now contain complete CSS colors. Wrap existing bare
HSL channel overrides in `hsl(...)` and remove `hsl(var(--token))` wrappers in custom
CSS. The placeholder `VERSION` export is removed. Legacy label/ARIA props and the
old Form layout helpers remain available as deprecated compatibility APIs; use
`labels`, standard `aria-*` attributes and `Field` for new code.
