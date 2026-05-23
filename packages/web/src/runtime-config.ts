/**
 * Runtime configuration for the prebuilt admin SPA.
 *
 * The standalone bundle reads this from `window.__MODERN_ADMIN__`; the
 * library `mount()` API takes it as an argument. Either way it is the
 * single source of truth for "where is the API", "which translations to
 * apply", and how the admin client should behave at runtime.
 *
 * No build-time env vars: one bundle serves any deployment.
 */

import type { MetadataTranslations } from '@modern-admin/react'

export interface ModernAdminBrand {
  /** Shown in the sidebar header and login screen. */
  title?: string
  /** Optional logo image URL. */
  logoUrl?: string
}

export interface ModernAdminRuntimeConfig {
  /**
   * Absolute base URL of the admin API (the @modern-admin/nest backend).
   * Leave undefined to use same-origin — recommended when the SPA is served
   * by the same NestJS process that exposes the admin API.
   */
  apiUrl?: string
  /** RequestCredentials forwarded to every fetch. Defaults to 'include'. */
  credentials?: RequestCredentials
  /** Extra headers attached to every request (e.g. CSRF, custom auth). */
  headers?: Record<string, string>
  /** Helper line shown on the login screen — e.g. demo credentials. */
  loginHint?: string
  /** Initial UI locale code. Falls back to the persisted choice / 'en'. */
  defaultLocale?: string
  /** Locale used when a translation is missing. Defaults to 'en'. */
  fallbackLocale?: string
  /**
   * Whitelist of locale codes to expose in the header switcher (filters
   * the built-in 9-locale bundle: `en`, `ru`, `de`, `es`, `fr`, `it`, `ja`,
   * `pl`, `pt-BR`). Behaviour:
   *   - omitted / empty array → all built-in locales available
   *   - single code           → switcher hides, that locale is forced
   *   - multiple codes        → switcher lists only those locales
   */
  locales?: string[]
  /** Optional per-resource / per-property metadata translations. */
  metadataTranslations?: MetadataTranslations
  /** Branding overrides (title, logo). */
  brand?: ModernAdminBrand
  /** Persist the demo session credentials in localStorage. */
  persistDemoSession?: boolean
  /**
   * Path under which the host mounts Better Auth's Node handler. Drives
   * the sign-in / sign-out endpoints — defaults to `/admin/api/auth`,
   * matching the canonical CLI scaffold (and `ModernAdminStaticUiModule`
   * mounted at `/admin`). Override only when the host mounts Better Auth
   * elsewhere; pass *without* a trailing slash.
   */
  authBasePath?: string
  /**
   * URL prefix where the SPA is mounted (e.g. `/admin`). Injected
   * automatically by `ModernAdminStaticUiMiddleware` from its `path` option
   * so you normally do not need to set this. The router uses it as its
   * basepath so all internal navigation and deep-link refreshes stay under
   * the correct prefix. Pass without a trailing slash.
   */
  basePath?: string
}

declare global {
  interface Window {
    __MODERN_ADMIN__?: ModernAdminRuntimeConfig
  }
}

/**
 * Reads runtime config from `window.__MODERN_ADMIN__`. Returns an empty
 * object (same-origin defaults) when nothing is injected.
 */
export function readWindowConfig(): ModernAdminRuntimeConfig {
  if (typeof window === 'undefined') return {}
  return window.__MODERN_ADMIN__ ?? {}
}
