import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Helpers for driving the nested Radix dropdown menus that `ActionMenu`
 * (`packages/react/src/action-menu.tsx`) builds from an action's `nesting`.
 *
 * Sub-menus are the flakiest surface in the suite, for two reasons that only
 * bite on a loaded machine:
 *
 *   • Pointer actions (`click`, `hover`) wait for the target to be *stable*,
 *     but a sub-trigger is mid-animation while its parent menu opens. Under
 *     CI load the retry loop can still be waiting when a re-render (any
 *     background list refetch) detaches the node — Playwright then reports
 *     "element was detached from the DOM" or plain timeout.
 *   • `page.getByRole('menuitem', …)` is page-wide, so it happily matches
 *     entries of a *different* open menu (row menu vs toolbar menu).
 *
 * `openSubmenu` avoids both: it scopes to the menu it was handed and uses
 * the keyboard, which needs focus but not stability — and which is the same
 * path a keyboard user takes anyway.
 */

/** The dropdown opened by a trigger whose accessible name matches `name`.
 *  Radix labels menu content via `aria-labelledby` → the trigger. */
export function menuOf(page: Page, name: RegExp): Locator {
  return page.getByRole('menu', { name })
}

/**
 * Expand `label`'s sub-menu inside `menu` and return the sub-menu locator.
 * Scoped and keyboard-driven — see the note above.
 */
export async function openSubmenu(
  page: Page,
  menu: Locator,
  label: RegExp | string,
): Promise<Locator> {
  const trigger = menu.getByRole('menuitem', {
    name: label,
    ...(typeof label === 'string' ? { exact: true } : {}),
  })
  await trigger.focus()
  await trigger.press('ArrowRight')
  const submenu = page.getByRole('menu', { name: label })
  await expect(submenu).toBeVisible({ timeout: 5_000 })
  return submenu
}

/** Activate a leaf item inside an open menu, by keyboard for the same
 *  stability reasons. */
export async function chooseItem(menu: Locator, label: RegExp | string): Promise<void> {
  const item = menu.getByRole('menuitem', {
    name: label,
    ...(typeof label === 'string' ? { exact: true } : {}),
  })
  await item.focus()
  await item.press('Enter')
}
