// Process-local registry of currently-mounted hotkeys. `useHotkey` opts
// into registration by passing `description` in its options; the entry
// shows up in <KeyboardShortcutsHelp> until its component unmounts.
//
// Without a surrounding <HotkeyRegistryProvider> the registry is a
// no-op so plain `useHotkey` stays usable in isolation (tests etc.).

import * as React from 'react'

export interface HotkeyDescriptor {
  /** Combo string in `useHotkey` syntax, e.g. `mod+s`, `shift+/`, `esc`. */
  keys: string
  description: string
  group?: string
}

interface HotkeyRegistryApi {
  register(d: HotkeyDescriptor): () => void
  list: HotkeyDescriptor[]
}

const NOOP_REGISTER: HotkeyRegistryApi['register'] = () => () => {}

const HotkeyRegistryContext = React.createContext<HotkeyRegistryApi>({
  register: NOOP_REGISTER,
  list: [],
})

export function HotkeyRegistryProvider({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  const [list, setList] = React.useState<HotkeyDescriptor[]>([])
  // Stable register: setList is stable from useState, and the closure
  // is captured once via useRef so dependent effects don't re-fire.
  const register = React.useRef<HotkeyRegistryApi['register']>((d) => {
    setList((prev) => [...prev, d])
    return () => {
      setList((prev) => prev.filter((x) => x !== d))
    }
  }).current
  const value = React.useMemo<HotkeyRegistryApi>(
    () => ({ register, list }),
    [register, list],
  )
  return (
    <HotkeyRegistryContext.Provider value={value}>
      {children}
    </HotkeyRegistryContext.Provider>
  )
}

export function useRegisteredHotkeys(): HotkeyDescriptor[] {
  return React.useContext(HotkeyRegistryContext).list
}

export function useHotkeyRegister(): HotkeyRegistryApi['register'] {
  return React.useContext(HotkeyRegistryContext).register
}
