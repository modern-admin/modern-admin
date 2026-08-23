// Shared plumbing for floating layers (popover / select / dropdown menu) so
// they survive mobile browsers. Two problems, two helpers:
//
//  - `LayerContainerProvider` lets a modal surface (Dialog / Sheet) advertise
//    its own DOM node as the portal target for nested floating content. Radix
//    modal layers wrap their content in `react-remove-scroll`, which only lets
//    touch-scroll through inside that subtree — a popover portaled to
//    `document.body` renders and clicks fine but cannot be scrolled with a
//    finger while the sheet is open.
//  - `useViewportCollisionPadding` folds the mobile browser's chrome (URL bar,
//    on-screen keyboard) into Radix's `collisionPadding`. Collision detection
//    measures against the layout viewport, whose top edge sits *under* the URL
//    bar; `visualViewport.offsetTop` is exactly the hidden strip, so a popover
//    that flips above its trigger no longer lands behind browser chrome.

import * as React from 'react'

const LayerContainerContext = React.createContext<HTMLElement | null>(null)

export function LayerContainerProvider({
  container,
  children,
}: {
  container: HTMLElement | null
  children: React.ReactNode
}): React.ReactElement {
  return (
    <LayerContainerContext.Provider value={container}>{children}</LayerContainerContext.Provider>
  )
}

/** Portal target for floating content: the nearest modal surface, or
 *  `undefined` to let Radix fall back to `document.body`. */
export function usePortalContainer(): HTMLElement | undefined {
  return React.useContext(LayerContainerContext) ?? undefined
}

export interface ViewportInsets {
  top: number
  right: number
  bottom: number
  left: number
}

const ZERO_INSETS: ViewportInsets = { top: 0, right: 0, bottom: 0, left: 0 }

// Single shared subscription — a page can hold dozens of mounted (closed)
// popovers, and each one attaching its own visualViewport listeners would be
// pure overhead.
const listeners = new Set<() => void>()
let insets: ViewportInsets = ZERO_INSETS

function readInsets(): ViewportInsets {
  const vv = typeof window === 'undefined' ? null : window.visualViewport
  if (!vv) return ZERO_INSETS
  const top = Math.max(0, Math.round(vv.offsetTop))
  const left = Math.max(0, Math.round(vv.offsetLeft))
  if (top === 0 && left === 0) return ZERO_INSETS
  // Only the leading edges need correcting: floating-ui already sizes the
  // collision boundary from `visualViewport.width/height`, it just anchors it
  // at the layout viewport origin.
  return { top, right: 0, bottom: 0, left }
}

function handleViewportChange(): void {
  const next = readInsets()
  if (
    next.top === insets.top &&
    next.right === insets.right &&
    next.bottom === insets.bottom &&
    next.left === insets.left
  ) {
    return
  }
  insets = next
  for (const listener of listeners) listener()
}

function subscribeToViewport(onStoreChange: () => void): () => void {
  const vv = typeof window === 'undefined' ? null : window.visualViewport
  if (!vv) return () => {}
  if (listeners.size === 0) {
    insets = readInsets()
    vv.addEventListener('resize', handleViewportChange)
    vv.addEventListener('scroll', handleViewportChange)
  }
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
    if (listeners.size === 0) {
      vv.removeEventListener('resize', handleViewportChange)
      vv.removeEventListener('scroll', handleViewportChange)
    }
  }
}

const getInsets = (): ViewportInsets => insets
const getServerInsets = (): ViewportInsets => ZERO_INSETS

/** `collisionPadding` that keeps floating content clear of the mobile browser
 *  chrome in addition to the usual `base` breathing room. */
export function useViewportCollisionPadding(base = 8): ViewportInsets {
  const current = React.useSyncExternalStore(subscribeToViewport, getInsets, getServerInsets)
  return React.useMemo(
    () => ({
      top: current.top + base,
      right: current.right + base,
      bottom: current.bottom + base,
      left: current.left + base,
    }),
    [current, base],
  )
}

/** Fan a single element out to several refs (forwarded ref + local state). */
export function mergeRefs<T>(
  ...refs: ReadonlyArray<React.Ref<T> | undefined>
): React.RefCallback<T> {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node)
      else if (ref) (ref as React.MutableRefObject<T | null>).current = node
    }
  }
}
