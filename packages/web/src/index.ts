/**
 * @modern-admin/web — prebuilt admin SPA, with both a library API
 * (`mount()` + React `<App>`) and a standalone bundle for backends to
 * serve as static assets.
 */

export { App, type AppProps } from './app.js'
export { mount, type MountOptions, type MountedAdmin } from './mount.js'
export {
  readWindowConfig,
  type ModernAdminBrand,
  type ModernAdminRuntimeConfig,
} from './runtime-config.js'
