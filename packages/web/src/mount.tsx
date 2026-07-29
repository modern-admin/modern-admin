/**
 * Imperative mounting API for embedding the admin SPA inside another React
 * tree or vanilla HTML page. Consumers call once at startup:
 *
 *   import { mount } from '@modern-admin/web'
 *   mount(document.getElementById('root')!, { apiUrl: 'https://api.example.com' })
 *
 * This module deliberately does **not** import the stylesheet: an app that
 * registers its own components needs to own the Tailwind root so its classes
 * get scanned, and a second root here would compile Tailwind twice. Import it
 * yourself, either directly or from your own CSS:
 *
 *   import '@modern-admin/react/styles.css'
 *
 * For the prebuilt standalone bundle, `src/standalone.tsx` calls this for
 * you using `window.__MODERN_ADMIN__` and pulls in the stylesheet.
 */

import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { type ComponentLoader } from '@modern-admin/react'
import { initTheme } from '@modern-admin/ui'
import { App } from './app.js'
import type { ModernAdminRuntimeConfig } from './runtime-config.js'

export interface MountOptions {
  config: ModernAdminRuntimeConfig
  /** Optional ComponentLoader with custom property-type components. */
  components?: ComponentLoader
}

export interface MountedAdmin {
  /** Unmounts the admin SPA from its container. */
  unmount(): void
}

/**
 * Renders the admin SPA into `container`. Returns a handle with `unmount()`
 * for hosts that need to tear it down dynamically (rare — most users mount
 * once and never unmount).
 */
export function mount(container: Element, options: MountOptions): MountedAdmin {
  initTheme()
  const root: Root = createRoot(container)
  root.render(
    <StrictMode>
      <App config={options.config} components={options.components} />
    </StrictMode>,
  )
  return {
    unmount: () => root.unmount(),
  }
}
