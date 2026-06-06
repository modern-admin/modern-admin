/**
 * Entry point for the prebuilt standalone bundle. Picks up the runtime
 * config from `window.__MODERN_ADMIN__` (injected by the host server,
 * typically @modern-admin/nest's StaticController) and mounts into
 * `#root`.
 *
 * No build-time configuration — one bundle works for any deployment.
 */

import { mount } from './mount.js'
import { readWindowConfig } from './runtime-config.js'

const container = document.getElementById('root')
if (!container) {
  throw new Error('[modern-admin] expected #root container in the host page')
}

mount(container, { config: readWindowConfig() })
