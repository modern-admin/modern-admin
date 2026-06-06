import { afterEach, describe, expect, test } from 'bun:test'
import {
  _resetExtensionRegistry,
  getSidebarExtensions,
  getPropertyExtension,
  getRouteExtension,
  getSettingsSectionExtensions,
  registerExtensionRoute,
  registerPropertyExtension,
  registerSettingsSection,
  registerSidebarItem,
} from '../src/extension-registry.js'

const noop = () => null as unknown as never

afterEach(() => {
  _resetExtensionRegistry()
})

// ─── Sidebar ──────────────────────────────────────────────────────────────────

describe('registerSidebarItem', () => {
  test('appends items in registration order', () => {
    registerSidebarItem({ key: 'a', label: 'A', icon: noop, extensionKey: 'a' })
    registerSidebarItem({ key: 'b', label: 'B', icon: noop, extensionKey: 'b' })
    expect(getSidebarExtensions().map((e) => e.key)).toEqual(['a', 'b'])
  })

  test('duplicate key is silently ignored', () => {
    registerSidebarItem({ key: 'a', label: 'A', icon: noop, extensionKey: 'a' })
    registerSidebarItem({ key: 'a', label: 'A2', icon: noop, extensionKey: 'a2' })
    const items = getSidebarExtensions()
    expect(items).toHaveLength(1)
    expect(items[0]!.label).toBe('A')
  })

  test('returns empty array when nothing is registered', () => {
    expect(getSidebarExtensions()).toEqual([])
  })
})

// ─── Settings sections ────────────────────────────────────────────────────────

describe('registerSettingsSection', () => {
  test('appends sections in registration order', () => {
    registerSettingsSection({ key: 's1', labelKey: 'ns:s1', icon: noop, component: noop })
    registerSettingsSection({ key: 's2', labelKey: 'ns:s2', icon: noop, component: noop })
    expect(getSettingsSectionExtensions().map((s) => s.key)).toEqual(['s1', 's2'])
  })

  test('duplicate key is silently ignored', () => {
    registerSettingsSection({ key: 's1', labelKey: 'ns:s1', icon: noop, component: noop })
    registerSettingsSection({ key: 's1', labelKey: 'ns:s1-dup', icon: noop, component: noop })
    expect(getSettingsSectionExtensions()).toHaveLength(1)
    expect(getSettingsSectionExtensions()[0]!.labelKey).toBe('ns:s1')
  })

  test('returns empty array when nothing is registered', () => {
    expect(getSettingsSectionExtensions()).toEqual([])
  })
})

// ─── Property editors ─────────────────────────────────────────────────────────

describe('registerPropertyExtension', () => {
  test('returns the registered extension for the matching type', () => {
    const display = noop
    const editor = noop
    registerPropertyExtension('color-picker', { display, editor })
    const ext = getPropertyExtension('color-picker')
    expect(ext).toBeDefined()
    expect(ext!.display).toBe(display)
    expect(ext!.editor).toBe(editor)
  })

  test('returns undefined for unregistered type', () => {
    expect(getPropertyExtension('nonexistent')).toBeUndefined()
  })

  test('overwrites previous registration for the same type', () => {
    const display1 = noop
    const display2 = noop
    registerPropertyExtension('custom', { display: display1, editor: noop })
    registerPropertyExtension('custom', { display: display2, editor: noop })
    expect(getPropertyExtension('custom')!.display).toBe(display2)
  })
})

// ─── Routes ───────────────────────────────────────────────────────────────────

describe('registerExtensionRoute', () => {
  test('returns the registered route for the matching key', () => {
    const component = noop
    registerExtensionRoute({ key: 'rbac', component })
    const ext = getRouteExtension('rbac')
    expect(ext).toBeDefined()
    expect(ext!.component).toBe(component)
  })

  test('returns undefined for unregistered key', () => {
    expect(getRouteExtension('missing')).toBeUndefined()
  })

  test('duplicate key is silently ignored', () => {
    const c1 = noop
    const c2 = noop
    registerExtensionRoute({ key: 'rbac', component: c1 })
    registerExtensionRoute({ key: 'rbac', component: c2 })
    expect(getRouteExtension('rbac')!.component).toBe(c1)
  })
})

// ─── _resetExtensionRegistry ─────────────────────────────────────────────────

describe('_resetExtensionRegistry', () => {
  test('clears all registrations', () => {
    registerSidebarItem({ key: 'x', label: 'X', icon: noop, extensionKey: 'x' })
    registerSettingsSection({ key: 'x', labelKey: 'ns:x', icon: noop, component: noop })
    registerPropertyExtension('x', { display: noop, editor: noop })
    registerExtensionRoute({ key: 'x', component: noop })

    _resetExtensionRegistry()

    expect(getSidebarExtensions()).toEqual([])
    expect(getSettingsSectionExtensions()).toEqual([])
    expect(getPropertyExtension('x')).toBeUndefined()
    expect(getRouteExtension('x')).toBeUndefined()
  })
})
