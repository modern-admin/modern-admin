# Custom UI components — when and how

The frontend ships rich defaults for every property type. Reach for a
custom component only when:

1. The data shape is unique to the host project (e.g. geo-coords
   needing a map).
2. The default display is technically correct but visually wrong
   (e.g. a `status` enum needing colored badges).
3. You need to compose multiple fields into one widget (rare; usually
   `showWhen` is enough).

Workflow:

```ts
// 1. Build the component using @modern-admin/ui primitives.
import { Button, Badge, Card } from '@modern-admin/ui'

export function StatusBadge(props: PropertyDisplayProps) {
  const color = props.record.params.status === 'paid' ? 'green' : 'red'
  return <Badge variant={color}>{props.record.params.status}</Badge>
}

// 2. Register on the frontend componentLoader.
componentLoader.add('StatusBadge', StatusBadge)

// 3. Reference by name in resource options.
properties: {
  status: { components: { list: 'StatusBadge', show: 'StatusBadge' } },
}
```

Components must be **i18n-unaware** — accept a `labels?: { … }` prop
with English defaults. Translation happens in the `packages/react`
wrapper, not inside the UI component.

Always prefer composition of `@modern-admin/ui` primitives
(`Button`, `Badge`, `Card`, `Dialog`, `Sheet`, `Tabs`, `Select`,
`Combobox`, `Field`, `DataTable`) over raw HTML/CSS. They already
follow Tailwind 4 conventions, dark-mode tokens, and shadcn variants.
Pair every `border` className with an explicit color
(`border border-border`) — in Tailwind 4 `border` alone falls back to
`currentColor`.
