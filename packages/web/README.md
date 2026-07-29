# @modern-admin/web

[![npm version](https://img.shields.io/npm/v/@modern-admin/web)](https://www.npmjs.com/package/@modern-admin/web)
[![license](https://img.shields.io/npm/l/@modern-admin/web)](https://github.com/modern-admin/modern-admin/blob/main/LICENSE)

> Pre-built React admin SPA. Mount it into a host page or let @modern-admin/nest serve the standalone bundle.

Part of [**Modern Admin**](https://github.com/modern-admin/modern-admin) — a universal, modern admin panel framework
built on NestJS + React 19, with Prisma/Drizzle adapters, Tailwind 4 UI, and
end-to-end Zod validation.

## Installation

```sh
bun add @modern-admin/web
```

## Building your own bundle (custom components)

The prebuilt standalone bundle registers no custom components, so as soon as a
resource uses `component: 'MyThing'` on an action or `components: { edit: … }`
on a property you need your own build. Three files, then point
`ModernAdminStaticUiModule`'s `webPackage` at your package:

```ts
// vite.config.ts
import { defineAdminAppConfig } from '@modern-admin/web/vite'

// Dev server, the `dist/standalone/` layout the Nest middleware expects,
// precompressed assets and prefetch hints — all preconfigured.
export default defineAdminAppConfig({ apiProxy: 'http://localhost:3011' })
```

```css
/* src/styles.css — you own the Tailwind root so your classes get scanned */
@import "@modern-admin/react/styles.css";
@source "./**/*.{ts,tsx}";
```

```tsx
// src/main.tsx
import { mount, readWindowConfig } from '@modern-admin/web'
import { ComponentLoader } from '@modern-admin/react'
import { SendPushForm } from './components/send-push-form.js'
import './styles.css'

mount(document.getElementById('root')!, {
  config: readWindowConfig(),
  components: new ComponentLoader().add('SendPushForm', SendPushForm),
})
```

`vite dev` gives you React Fast Refresh on those components. Editing the module
that builds the `ComponentLoader` itself falls back to a full reload — HMR can
only patch modules whose exports are all components.

`mount()` imports no CSS of its own: a second Tailwind root would compile the
framework stylesheet twice, without your `@source`. Import it as shown above.

## Documentation

Setup guides, architecture, and usage examples live in the
[Modern Admin README](https://github.com/modern-admin/modern-admin#readme).

## License

[MIT](https://github.com/modern-admin/modern-admin/blob/main/LICENSE) © Modern Admin
