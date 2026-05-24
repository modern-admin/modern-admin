// UI Extension Registry — lets Pro plugins add sidebar items, settings
// sections, custom property renderers, and full-page routes without
// modifying `packages/react` directly.
//
// Usage: call `register*` functions during module initialisation (before
// `<AdminApp>` renders). Every consumer of `@modern-admin/react` can import
// and call these helpers; the registry is a process-global singleton.
//
// Design notes:
//  • Module-global (not React-context-based) so registration can happen in
//    plain JS outside any component tree.
//  • Idempotent: re-registering the same `key` is silently ignored so hot-
//    reload doesn't produce duplicates.
//  • Zero external runtime deps — only imports prop-type interfaces from
//    `./types.ts` which is already bundled.

import type * as React from 'react'
import type { PropertyDisplayProps, PropertyEditorProps } from './types.js'

// ─── Extension shapes ─────────────────────────────────────────────────────────

/**
 * Extra navigation item rendered in the sidebar below the built-in entries
 * (Home, Audit Log) and above the resource list.
 */
export interface SidebarExtension {
  /** Stable unique key (e.g. `'rbac'`). Duplicate keys are silently ignored. */
  key: string
  /** Label rendered next to the icon in the sidebar. */
  label: string
  /** Lucide-compatible icon component. */
  icon: React.ComponentType<{ className?: string }>
  /**
   * Extension route key — navigates to `/ext/<extensionKey>` within the
   * admin shell (i.e., `{ name: 'extension', key: extensionKey }`).
   * Must match the `key` of a corresponding `registerExtensionRoute` call
   * so the router can render the right component.
   */
  extensionKey: string
  /**
   * Optional capability gate. When set, the item is rendered only when
   * `features[featureGate] === true` in the admin config (i.e. the backend
   * has explicitly enabled the subsystem). Leave unset to always show.
   */
  featureGate?: string
}

/**
 * Extra section added to the Settings page navigation. The consumer's
 * `component` is rendered as the main content area when the section is active.
 */
export interface SettingsExtension {
  /**
   * Unique section key (appears in the URL as `/settings/<key>`). Must be
   * URL-safe (no slashes, encodes cleanly). Duplicate keys are ignored.
   */
  key: string
  /**
   * i18n translation key for the section label shown in the settings nav
   * (e.g. `'rbac:settings.title'`). Falls back to `key` if the key is missing
   * from the active locale.
   */
  labelKey: string
  /** Lucide-compatible icon component shown next to the label. */
  icon: React.ComponentType<{ className?: string }>
  /**
   * Component rendered as the main content when this section is active.
   * It receives no props — read what you need via hooks or internal state.
   */
  component: React.ComponentType
}

/**
 * Custom property type renderer pair. When registered for `type`, the
 * built-in `PropertyDisplay` and `PropertyEditor` switches fall through
 * to this extension instead of rendering the default plain-text fallback.
 */
export interface PropertyExtension {
  /** Renders a read-only value cell (list / show view). */
  display: React.ComponentType<PropertyDisplayProps>
  /** Renders an editable form field (edit / new view). */
  editor: React.ComponentType<PropertyEditorProps>
}

/**
 * Full-page route rendered inside the authenticated admin shell at the
 * reserved path `/ext/<key>`.
 */
export interface RouteExtension {
  /**
   * URL-safe key (no slashes). The route becomes `/ext/<key>`. Must be
   * unique — duplicate keys are silently ignored.
   */
  key: string
  /** Component rendered as the page content inside the shell layout. */
  component: React.ComponentType
}

// ─── Internal registry ────────────────────────────────────────────────────────

interface RegistryData {
  sidebarItems: SidebarExtension[]
  settingsSections: SettingsExtension[]
  propertyEditors: Map<string, PropertyExtension>
  routes: RouteExtension[]
}

const registry: RegistryData = {
  sidebarItems: [],
  settingsSections: [],
  propertyEditors: new Map(),
  routes: [],
}

// ─── Registration API ─────────────────────────────────────────────────────────

/**
 * Register a sidebar navigation item for an extension page.
 * Call this during module initialisation, before `<AdminApp>` renders.
 * Re-registering the same `key` is a no-op.
 */
export function registerSidebarItem(ext: SidebarExtension): void {
  if (!registry.sidebarItems.find((e) => e.key === ext.key)) {
    registry.sidebarItems.push(ext)
  }
}

/**
 * Register a custom section in the Settings page.
 * Call this during module initialisation, before `<AdminApp>` renders.
 * Re-registering the same `key` is a no-op.
 */
export function registerSettingsSection(ext: SettingsExtension): void {
  if (!registry.settingsSections.find((e) => e.key === ext.key)) {
    registry.settingsSections.push(ext)
  }
}

/**
 * Register a custom property type renderer (display + editor pair).
 * When `property.type === type`, the built-in switch delegates to this
 * extension instead of the plain-text fallback.
 * Re-registering the same `type` overwrites the previous entry.
 */
export function registerPropertyExtension(type: string, ext: PropertyExtension): void {
  registry.propertyEditors.set(type, ext)
}

/**
 * Register a full-page extension route at `/ext/<key>` inside the admin
 * shell. A matching `SidebarExtension` with `extensionKey === key` provides
 * the navigation entry.
 * Re-registering the same `key` is a no-op.
 */
export function registerExtensionRoute(ext: RouteExtension): void {
  if (!registry.routes.find((r) => r.key === ext.key)) {
    registry.routes.push(ext)
  }
}

// ─── Accessors (consumed by shell components at render time) ──────────────────

/** Returns all registered sidebar extensions in registration order. */
export function getSidebarExtensions(): SidebarExtension[] {
  return registry.sidebarItems
}

/** Returns all registered settings sections in registration order. */
export function getSettingsSectionExtensions(): SettingsExtension[] {
  return registry.settingsSections
}

/**
 * Returns the registered property extension for `type`, or `undefined` if
 * no extension covers it (fall through to plain-text).
 */
export function getPropertyExtension(type: string): PropertyExtension | undefined {
  return registry.propertyEditors.get(type)
}

/** Returns the registered route extension for `key`, or `undefined`. */
export function getRouteExtension(key: string): RouteExtension | undefined {
  return registry.routes.find((r) => r.key === key)
}

/**
 * Clears all registrations.
 * @internal For unit tests only — do not call in production code.
 */
export function _resetExtensionRegistry(): void {
  registry.sidebarItems = []
  registry.settingsSections = []
  registry.propertyEditors.clear()
  registry.routes = []
}
