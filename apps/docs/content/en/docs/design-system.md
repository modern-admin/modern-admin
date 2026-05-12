# Design system & theming

Modern Admin uses a **CSS-first design system** built on Tailwind CSS 4, shadcn/ui
primitives, and Radix UI. All visual tokens — colors, radius, spacing, typography — live
in a single CSS file (`packages/ui/src/styles.css`). There is no `tailwind.config.js`.

---

## Architecture overview

```
packages/ui/src/styles.css   ← single source of truth
  @import "tailwindcss"      ← Tailwind 4 engine
  @import "tw-animate-css"   ← Radix/shadcn animation utilities
  @plugin "@tailwindcss/typography"   ← prose utilities for richtext

  @theme { … }              ← semantic design tokens → Tailwind utilities
  :root  { … }              ← light-theme HSL variable values
  .dark  { … }              ← dark-theme HSL variable overrides
```

Apps import the stylesheet once in their entry point:

```ts
// apps/web/src/main.tsx (or your app's entry)
import '@modern-admin/ui/styles.css'
```

---

## Semantic color tokens

Every surface color is a **semantic token** — a CSS custom property holding an HSL
channel triple (`H S% L%`) that is resolved at runtime by `hsl(var(--token))`. Tailwind
utilities like `bg-background`, `text-foreground`, `border-border` map to these tokens
via the `@theme` block.

### Available tokens

| Token | Tailwind utility | Use |
|-------|------------------|-----|
| `--background` | `bg-background` | Page / app background |
| `--foreground` | `text-foreground` | Primary text |
| `--muted` | `bg-muted` | Subtle background (inputs, chips) |
| `--muted-foreground` | `text-muted-foreground` | Secondary / placeholder text |
| `--card` | `bg-card` | Card / panel background |
| `--card-foreground` | `text-card-foreground` | Text on cards |
| `--popover` | `bg-popover` | Dropdown / popover background |
| `--popover-foreground` | `text-popover-foreground` | Text inside popovers |
| `--border` | `border-border` | Default border color |
| `--input` | `border-input` | Input / control border |
| `--ring` | `ring-ring` | Focus ring color |
| `--primary` | `bg-primary` | Brand / primary action |
| `--primary-foreground` | `text-primary-foreground` | Text on primary backgrounds |
| `--secondary` | `bg-secondary` | Secondary action / muted button |
| `--secondary-foreground` | `text-secondary-foreground` | Text on secondary backgrounds |
| `--accent` | `bg-accent` | Hover highlight (defaults to secondary) |
| `--accent-foreground` | `text-accent-foreground` | Text on accent backgrounds |
| `--destructive` | `bg-destructive` | Danger / delete |
| `--destructive-foreground` | `text-destructive-foreground` | Text on destructive backgrounds |

All Tailwind opacity modifiers work with these utilities:
`bg-primary/80`, `text-muted-foreground/60`, `border-destructive/50`.

### Border radius tokens

| CSS variable | Tailwind utility | Value |
|---|---|---|
| `--radius` | — | `0.5rem` (base) |
| `--radius-sm` | `rounded-sm` | `calc(var(--radius) - 4px)` |
| `--radius-md` | `rounded-md` | `calc(var(--radius) - 2px)` |
| `--radius-lg` | `rounded-lg` | `var(--radius)` |
| `--radius-xl` | `rounded-xl` | `calc(var(--radius) + 4px)` |

Override `--radius` in your custom theme to make all components rounder or squarer at once.

---

## Light and dark themes

Modern Admin ships two built-in themes. The **light theme** is applied by default via
`:root` rules; the **dark theme** activates when the `.dark` class is present on
`<html>`.

### Light theme defaults

```css
:root {
  --background: 0 0% 100%;          /* pure white */
  --foreground: 222 47% 11%;        /* near-black navy */
  --primary:    222 47% 11%;        /* same — filled buttons are very dark */
  --destructive: 0 84% 60%;         /* vivid red */
  --radius: 0.5rem;
  /* … */
}
```

### Dark theme defaults

```css
.dark {
  --background: 240 5% 5%;          /* near-black (slight zinc hue) */
  --foreground: 0 0% 98%;           /* near-white */
  --muted:      240 4% 14%;
  --primary:    0 0% 98%;           /* white — filled buttons become white */
  --destructive: 0 62% 40%;         /* muted red (less harsh on dark bg) */
  /* … */
}
```

The dark palette uses very low-saturation zinc/charcoal neutrals so it reads as
black/charcoal rather than navy blue.

---

## Theme API

`packages/ui` exports a tiny theme helper from `@modern-admin/ui`:

```ts
import { initTheme, setThemeMode, readThemeMode } from '@modern-admin/ui'

// Call once on app boot (client-side only).
// Returns an unsubscribe function for system-preference changes.
const unsubscribe = initTheme()

// Read the persisted preference: 'light' | 'dark' | 'system'
const current = readThemeMode()

// Switch theme and persist the preference
setThemeMode('dark')    // force dark
setThemeMode('light')   // force light
setThemeMode('system')  // follow OS preference
```

### How it works

1. `initTheme()` reads `localStorage['modern-admin:theme']`.
2. If `'system'`, it reads `prefers-color-scheme` via `matchMedia`.
3. Toggles the `.dark` class on `document.documentElement` accordingly.
4. Registers a `change` listener on the media query so system-mode updates live when
   the user changes their OS setting.

The `ThemeToggle` component in `packages/react` uses these helpers and wires up a button
in the admin shell header.

---

## Custom themes

Because all colors are CSS custom properties, you can create entirely custom themes by
overriding the variables. There are two common approaches:

### Approach 1 — override in your app CSS

```css
/* my-app/src/theme.css */
@import '@modern-admin/ui/styles.css';

:root {
  --primary: 262 83% 58%;          /* purple */
  --primary-foreground: 0 0% 100%;
  --radius: 0.75rem;               /* rounder */
}

.dark {
  --primary: 262 83% 70%;          /* lighter purple for dark bg */
  --primary-foreground: 0 0% 100%;
}
```

### Approach 2 — add a named theme class

```css
/* Add alongside the existing :root and .dark blocks */
.theme-ocean {
  --primary: 200 100% 40%;
  --primary-foreground: 0 0% 100%;
  --background: 210 30% 97%;
  --foreground: 210 60% 15%;
}

.dark.theme-ocean {
  --primary: 200 100% 60%;
  --background: 210 30% 8%;
  --foreground: 0 0% 98%;
}
```

Apply it via `document.documentElement.classList.add('theme-ocean')`.

### Token reference for custom themes

When building a custom theme, override the tokens in order of influence:

1. **`--background` / `--foreground`** — page surface and primary text; most impactful
2. **`--primary` / `--primary-foreground`** — action buttons, links, focus rings
3. **`--muted` / `--muted-foreground`** — secondary surfaces and placeholder text
4. **`--card` / `--card-foreground`** — panel and table backgrounds
5. **`--border` / `--input`** — dividers and control outlines
6. **`--destructive`** — danger states
7. **`--radius`** — global corner radius

---

## Brand colors

In addition to semantic tokens, `@theme` declares a fixed **brand palette**:

```css
@theme {
  --color-brand-50:  #f5f7ff;
  --color-brand-100: #e6ebff;
  --color-brand-500: #4f5af3;   /* main indigo */
  --color-brand-600: #3b46d8;
  --color-brand-700: #2c36b3;
}
```

Use them as Tailwind utilities: `bg-brand-500`, `text-brand-600`, `border-brand-100`.
These are **fixed** values — they do not change between light and dark themes. Use them
sparingly (logos, highlights) rather than for interactive controls.

---

## Typography

Long-form text bodies (richtext fields, markdown content) use the
`@tailwindcss/typography` plugin via the `prose` utility:

```tsx
<div className="prose prose-sm dark:prose-invert max-w-none">
  {/* rendered HTML or MDX */}
</div>
```

The `RichtextEditor` and `RichtextRender` components apply `prose` automatically on the
editor canvas. The `dark:prose-invert` variant ensures headings and code blocks stay
readable in dark mode.

---

## Important: borders in Tailwind 4

Tailwind 4 **changed the default `border-color`** — it now falls back to `currentColor`
(the text color) instead of gray-200. A bare `border` class will produce a near-black
outline in light mode and a near-white outline in dark mode.

**Always pair `border` with an explicit color token:**

```tsx
// Correct
<div className="border border-border">…</div>
<div className="border border-input">…</div>
<div className="border border-destructive/50">…</div>

// Wrong — renders as near-black/white line
<div className="border">…</div>
```

The same applies to `border-dashed`, `border-2`, and other border-width utilities.
Reference: all `Card`, `Input`, `Dialog`, and `Sheet` components in `@modern-admin/ui`
follow this pattern.

---

## Scrollbars

Custom scrollbar styles are included in `styles.css`. They use the same semantic tokens
so they adapt automatically to any theme:

- **Firefox**: `scrollbar-width: thin` + `scrollbar-color: hsl(var(--border)) transparent`
- **WebKit/Blink**: `10px` width, rounded pill thumb, hover/active states

Scrollbars are scoped to actually-scrollable containers (`html`, `body`, `[data-scroll]`,
`.overflow-auto`, `textarea`, `pre`) to avoid layout artifacts on non-scrolling elements.

---

## Animations

`tw-animate-css` provides the shadcn/Radix animation utilities:

```
animate-in   fade-in-0     slide-in-from-top-2    zoom-in-95
animate-out  fade-out-0    slide-out-to-top-2     zoom-out-95
```

These are triggered by Radix's `data-state="open"` / `data-state="closed"` attributes,
so dropdowns, dialogs, and popovers animate automatically without any JavaScript.

Accordion open/close uses custom keyframes defined in `@theme`:

```css
--animate-accordion-down: accordion-down 0.18s ease-out;
--animate-accordion-up:   accordion-up   0.18s ease-out;
```

---

## Icons

All icons come from [Lucide React](https://lucide.dev/) (`lucide-react@^1.x`). The project
uses a consistent mapping:

| Icon | Semantic meaning |
|------|-----------------|
| `Plus` | Create / new |
| `Pencil` / `Edit` | Edit |
| `Trash2` | Delete |
| `Eye` | View / show |
| `Download` | Export |
| `Search` | Search |
| `Save` | Save |
| `RefreshCw` | Refresh / reload |
| `ListFilter` | Filter panel |
| `SlidersHorizontal` | Column / settings picker |
| `X` | Close / cancel |
| `Check` | Confirm |
| `MoreHorizontal` | Row actions menu |
| `LogIn` / `LogOut` | Auth |
| `Menu` / `PanelLeftOpen` | Open sidebar |
| `PanelLeftClose` | Close sidebar |
| `ChevronLeft/Right` | Pagination prev/next |
| `ChevronsLeft/Right` | First/last page |
| `FileSpreadsheet` | CSV export |
| `FileJson` | JSON export |

### Sizing conventions

| Context | Class |
|---------|-------|
| Next to button text | `size-4` |
| Emphasis / tile buttons | `size-5` |
| Inline secondary controls | `size-3.5` |
| Icon-only mobile buttons | `size-4` + `aria-label` |

`Button` automatically applies `[&_svg]:size-4 [&_svg]:shrink-0` to all SVG children so
you don't need to repeat the class inside a button.

---

## Mobile-first layout

All components are designed **mobile-first**: base classes target narrow viewports, and
`sm:` / `md:` / `lg:` prefixes progressively enhance the layout.

Key patterns used across the component library:

- Sidebar collapses to a `Sheet` drawer on mobile (below `lg:`)
- Forms and tables fill full width by default
- Two-column form layouts use `sm:grid-cols-2`
- Icon-only mobile buttons use `hidden sm:inline` to show labels on wider screens
- Dialog and sheet widths are capped with `max-w-*` and always fit small screens
- The `KeyValueEditor` stacks label-above-input on narrow viewports (`flex-col`), switching
  to side-by-side from `sm:` (`sm:flex-row`)

---

## The `cn` utility

All components accept a `className` prop merged via the `cn` utility — a `clsx` +
`tailwind-merge` wrapper that resolves Tailwind class conflicts correctly:

```ts
import { cn } from '@modern-admin/ui'

// Merge multiple conditions; later wins over earlier for the same property
cn('px-4 py-2 rounded-md', isActive && 'bg-primary text-white', className)

// tailwind-merge resolves conflicts:
cn('px-4', 'px-6')   // → 'px-6'  (not 'px-4 px-6')
```

Use it in your own custom components when composing classes from multiple sources.
