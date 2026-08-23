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

import type { AdminAuthPaths, MetadataTranslations } from '@modern-admin/react'

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
  /**
   * Locale the UI starts in when the visitor has no persisted choice, or
   * when their persisted choice is not in `locales`. A previous, still-valid
   * choice wins — use `forceLocale` to override that too.
   */
  defaultLocale?: string
  /**
   * Pin the UI to one locale: the persisted choice is ignored and the header
   * switcher collapses. Unlike `locales: ['ru']`, the other bundles stay
   * loaded and keep serving `fallbackLocale` for any missing key.
   */
  forceLocale?: string
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
  /**
   * Overrides for the framework's own UI strings, merged over the built-in
   * dictionaries per locale. This is the supported way to rename the product,
   * reword a built-in label, or ship a translation fix without a release:
   *
   * ```json
   * { "ru": { "common:appName": "Acme", "auth:tagline": "…" } }
   * ```
   *
   * Keys use the flat `namespace:key` form of the bundled locales.
   * `metadataTranslations` is the separate, resource-metadata equivalent.
   */
  translations?: Record<string, Record<string, string>>
  /**
   * Branding overrides applied to the sidebar header, the loading splash,
   * and both marks on the login screen.
   */
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
  /** Per-route auth overrides for backends whose provider uses different URLs. */
  authPaths?: Partial<AdminAuthPaths>
  /**
   * URL prefix where the SPA is mounted (e.g. `/admin`). Injected
   * automatically by `ModernAdminStaticUiMiddleware` from its `path` option
   * so you normally do not need to set this. The router uses it as its
   * basepath so all internal navigation and deep-link refreshes stay under
   * the correct prefix. Pass without a trailing slash.
   */
  basePath?: string
  /**
   * When true, the sidebar resource list shows the raw resource id next
   * to the localized label (e.g. "Posts (posts)") whenever the label
   * differs from the id. Defaults to `false` — keeping the sidebar tidy.
   * The home page tile and selector dropdowns (chart builder, etc.)
   * always show both regardless of this flag.
   */
  showSidebarResourceIds?: boolean
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
