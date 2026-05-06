// Tiny theme toggle helper — flips `.dark` on the document root and
// persists the preference. The actual tokens live in styles.css.

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'modern-admin:theme'

const prefersDark = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

const applyClass = (dark: boolean): void => {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', dark)
}

/** Returns the persisted theme, or 'system' when nothing was saved. */
export const readThemeMode = (): ThemeMode => {
  if (typeof localStorage === 'undefined') return 'system'
  const v = localStorage.getItem(STORAGE_KEY)
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

/** Persist a theme choice and apply it immediately. */
export const setThemeMode = (mode: ThemeMode): void => {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, mode)
  applyClass(mode === 'dark' || (mode === 'system' && prefersDark()))
}

/**
 * Initialize the theme on app boot. Call once in your client entry. The
 * returned function unsubscribes from system preference changes.
 */
export const initTheme = (): (() => void) => {
  const mode = readThemeMode()
  applyClass(mode === 'dark' || (mode === 'system' && prefersDark()))
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const listener = (e: MediaQueryListEvent): void => {
    if (readThemeMode() === 'system') applyClass(e.matches)
  }
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}
