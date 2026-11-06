# @modern-admin/ui

[![npm version](https://img.shields.io/npm/v/@modern-admin/ui)](https://www.npmjs.com/package/@modern-admin/ui)
[![license](https://img.shields.io/npm/l/@modern-admin/ui)](https://github.com/modern-admin/modern-admin/blob/main/LICENSE)

> i18n-unaware shadcn/ui-style React component library used by @modern-admin/react.

Part of [**Modern Admin**](https://github.com/modern-admin/modern-admin) — a universal, modern admin panel framework
built on NestJS + React 19, with Prisma/Drizzle adapters, Tailwind 4 UI, and
end-to-end Zod validation.

## Installation

```sh
bun add @modern-admin/ui
```

Import the package stylesheet once in your application's CSS:

```css
@import '@modern-admin/ui/styles.css';
@source './**/*.{ts,tsx}';
```

Apps using `@modern-admin/react` should import `@modern-admin/react/styles.css`
instead; it includes the UI stylesheet. Each package scans its own sources,
including when installed with Bun's isolated linker.

## Component reference

| Purpose    | Components                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Actions    | `Button`, `ButtonGroup`, `Toggle`, `ToggleGroup`                                                                                                                   |
| Forms      | `Field*`, `Form`, `FormField`, `Input`, `Textarea`, `InputGroup*`, `PasswordInput`, `Checkbox`, `Switch`, `RadioGroup`, `Select`, `Combobox`, `Slider`             |
| Editors    | `DatePicker`, `DateRangeInput`, `JsonEditor`, `KeyValueEditor`, `RichtextEditor`, `ColorSwatchPicker`, `FileInput`, `MultiFileInput`                               |
| Feedback   | `Alert`, `AlertTitle`, `AlertDescription`, `Spinner`, `Progress`, `Skeleton`, `Empty*`, toast via `sonner`                                                         |
| Data       | `Badge`, `Avatar`, `Card*`, `Table*`, `ChartPanel`, `TimeSeriesChart`, `DiffView`, `AuditTimeline`, `RevisionTimeline`, `JsonView`, `RichtextView`, `MediaPreview` |
| Navigation | `Pagination`, `Breadcrumb*`, `Tabs*`, `Sidebar*`, `Command*`, `KeyboardShortcutsHelp`                                                                              |
| Overlays   | `Dialog*`, `AlertDialog*`, `Sheet*`, `Popover*`, `Tooltip*`, `HoverCard*`, `DropdownMenu*`                                                                         |
| Layout     | `Accordion*`, `ScrollArea`, `Separator`, `Kbd`                                                                                                                     |

The reference app includes an interactive gallery at `/ui.html`. From the repo
root, run `bun run dev:web` and visit `http://127.0.0.1:3000/ui.html` (use an SSH
tunnel on a remote host). The gallery needs no API or database. It supports all
nine locales, light/dark themes, validation states, keyboard navigation, charts,
and controlled editors. It is also included in the reference app's production build.

## Forms and accessibility

`Field` is the supported layout API. `Form` is React Hook Form's `FormProvider`;
`FormField` binds a field through its `Controller`. UI components never translate
text themselves: supply translated strings through `labels`. English defaults
allow standalone use. Use standard `aria-label`, `aria-labelledby` and
`aria-describedby` attributes.

```tsx
<Form {...form}>
  <FormField
    control={form.control}
    name="date"
    render={({ field, fieldState }) => (
      <Field invalid={fieldState.invalid}>
        <FieldLabel htmlFor="date">{labels.date}</FieldLabel>
        <DatePicker
          {...field}
          id="date"
          invalid={fieldState.invalid}
          aria-describedby={fieldState.error ? 'date-error' : undefined}
          labels={{ openCalendar: labels.openCalendar }}
        />
        <FieldError id="date-error">{fieldState.error?.message}</FieldError>
      </Field>
    )}
  />
</Form>
```

Primitive controls use `aria-invalid`; composite editors accept `invalid` and
forward it to their controls. `ref` is a regular React 19 prop. DatePicker,
Combobox, Input and ColorSwatchPicker expose the input; JsonEditor exposes its
textarea; DateRangeInput exposes its trigger button; file inputs expose their
focusable dropzone. KeyValueEditor and RichtextEditor expose a `{ focus() }`
handle for the first available control or the active editing surface. This
supports RHF's `setFocus` and focusing the first invalid field on submission.

The old `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`
and `useFormField` layout API is deprecated but remains supported. Existing
consumers can migrate to `Field` independently of the form bindings.

Legacy label props (`closeLabel`, `clearLabel`, `toggleLabel`,
`openCalendarLabel`, `timeLabel`, `formatLabel`, `invalidLabel`) and camel-case
ARIA props remain compatibility aliases. New code should use `labels.close`,
`labels.clear`, `labels.show`/`hide`, `labels.openCalendar`, `labels.time`,
`labels.format`, `labels.invalid` and standard `aria-*` attributes.

## Composing controls

```tsx
<InputGroup>
  <InputGroupAddon><InputGroupText>€</InputGroupText></InputGroupAddon>
  <InputGroupInput aria-label={labels.amount} inputMode="decimal" />
</InputGroup>

<Button loading={saving} onClick={save}>{labels.save}</Button>
<Spinner label={labels.loading} />

<Alert variant="warning">
  <AlertTitle>{labels.warning}</AlertTitle>
  <AlertDescription>{labels.message}</AlertDescription>
</Alert>
```

Use `InputGroupInput` or `InputGroupTextarea` inside `InputGroup`; the group owns
the border, focus and invalid state. For clearable Input, PasswordInput,
Combobox and DatePicker, `className` styles the visible outer box; `ref` and
ARIA attributes reach the inner control. Button `loading` disables activation,
sets `aria-busy`, and shows a decorative spinner while keeping the visible label.
Standalone Spinner needs a translated `label` when no other text conveys loading.

`Pagination` is controlled and **zero-based**: pass `pageIndex`, `pageCount`
and `onPageChange`. Translate `navigation`, `first`, `previous`, `next`, and
`last` through `labels`; `windowSize` limits the page buttons on small surfaces.
An empty result disables all navigation. `RadioGroup` is for mutually exclusive
form values. `ToggleGroup type="single"` is for toolbar/view choices; ignore an
empty `onValueChange` if your application requires one option to remain selected.

## Theme tokens

Every color variable contains a **complete CSS color**. Custom themes that used
bare HSL channels must migrate, for example from `--primary: 262 83% 58%` to
`--primary: hsl(262 83% 58%)`. Remove any `hsl(var(--primary))` wrappers from
custom styles and use `var(--primary)` directly.

```css
:root {
  --primary: oklch(0.45 0.18 270);
  --primary-foreground: white;
  --success: hsl(163 94% 21%);
  --chart-1: #9955bb;
}
.dark {
  --primary: oklch(0.8 0.12 270);
  --primary-foreground: #101014;
}
```

Status pairs are `success`, `warning`, `info`, `destructive` and their
`*-foreground` colors. Chart defaults use `--chart-1` through `--chart-6`;
`CHART_PALETTE` and `paletteFor()` share those slots. Explicit persisted hex
color overrides remain supported. Subtree themes work because Tailwind colors
reference these variables through `@theme inline`.

## Verification

`bun run --cwd packages/ui test` runs component behavior and editor logic tests
with bounded concurrency. `bun run --cwd apps/e2e e2e --config
playwright.ui-kit.config.ts` runs the backend-free gallery suite with one worker,
including axe WCAG checks, 375px/1280px layouts, light/dark themes, keyboard
interaction and screenshot attachments. Screenshot baselines for the main app
must be regenerated in the Playwright image specified by CI.

Framework setup and architecture are documented in the
[Modern Admin README](https://github.com/modern-admin/modern-admin#readme).

## License

[MIT](https://github.com/modern-admin/modern-admin/blob/main/LICENSE) © Modern Admin
