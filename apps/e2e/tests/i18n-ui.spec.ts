import { expect, test, type Page, type Locator } from '@playwright/test'

/**
 * i18n end-to-end coverage.
 *
 * Validates the localization story we wired into the demo SPA
 * (`apps/web/src/main.tsx`):
 *
 *   • `locales: ['en', 'ru']` restricts the header `LanguageSwitcher` to two
 *     options out of the 9 built-in bundles (`packages/i18n/src/locales`).
 *   • `metadataTranslations: { en, ru }` (loaded from
 *     `apps/web/src/locales/{en,ru}.json`) overrides backend resource
 *     metadata at render time via `localizeResource` in
 *     `packages/react/src/i18n.tsx`:
 *       – `resources.<id>.label` →  sidebar / list / show / edit headings
 *       – `resources.<id>.actions.<name>.label` → row + bulk action menus
 *       – `resources.<id>.properties.<path>.label` → table column headers,
 *         form labels, etc.
 *       – `navigation.groups.<name>` → sidebar group label
 *   • Chrome strings (Home / Filters / New / Open menu / …) come from the
 *     i18n bundle (`t('ns:key')` calls in `packages/react`).
 *   • The active locale is persisted in `localStorage["modern-admin:locale"]`
 *     and survives a hard reload.
 *
 * Every test starts from a fresh storage state (en is the default — the
 * `setup` project does not toggle locale) so we can assert the en→ru
 * transition without worrying about test ordering.
 */

const SIDEBAR_SELECTOR = '[data-sidebar="sidebar"]'

function sidebar(page: Page): Locator {
  return page.locator(SIDEBAR_SELECTOR)
}

/**
 * The `LanguageSwitcher` (`packages/react/src/header-controls.tsx`) renders
 * a header `<Button>` containing a `lucide-react` `Languages` icon plus a
 * `<span>` with the active locale code. We anchor on the icon's CSS class
 * (`lucide-languages`) — it is unique to that button and survives both
 * locale changes and `aria-expanded` toggles.
 */
function localeTrigger(page: Page): Locator {
  return page.locator('button:has(svg.lucide-languages)').first()
}

async function openLocaleMenu(page: Page): Promise<void> {
  await localeTrigger(page).click()
  await expect(page.getByRole('menu')).toBeVisible()
}

async function switchLocale(page: Page, target: 'en' | 'ru'): Promise<void> {
  await openLocaleMenu(page)
  const optionName = target === 'en' ? /^English$/ : /^Русский$/
  await page.getByRole('menu').getByRole('menuitem', { name: optionName }).click()
  // `MenuOption.onSelect` in `packages/react/src/header-controls.tsx` calls
  // `e.preventDefault()` so the Radix dropdown stays open after selection
  // (lets the user see the active checkmark). Close it explicitly —
  // otherwise the focus-trapped menu shadows subsequent role-based queries
  // against the rest of the page.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toBeHidden()
  // Wait for the trigger to reflect the new code before continuing — the
  // re-render is async and subsequent assertions can race it otherwise.
  await expect(localeTrigger(page)).toHaveText(target)
}

test.describe('i18n — language switcher', () => {
  test('lists only the configured locales (en + ru), hides the other built-ins', async ({
    page,
  }) => {
    await page.goto('/')
    await openLocaleMenu(page)
    const menu = page.getByRole('menu')

    // Both configured options appear.
    await expect(menu.getByRole('menuitem', { name: /^English$/ })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /^Русский$/ })).toBeVisible()

    // None of the unconfigured built-in locales are listed. We probe by
    // display name (`LocaleBundle.name`) to keep the assertion stable
    // against future code-renames.
    for (const name of [
      /^Deutsch$/,
      /^Español$/,
      /^Français$/,
      /^Italiano$/,
      /^日本語$/,
      /^Polski$/,
      /^Português \(Brasil\)$/,
    ]) {
      await expect(menu.getByRole('menuitem', { name })).toHaveCount(0)
    }

    await page.keyboard.press('Escape')
  })

  test('toggling the switcher updates the trigger label round-trip', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(localeTrigger(page)).toHaveText('en')
    await switchLocale(page, 'ru')
    await expect(localeTrigger(page)).toHaveText('ru')
    await switchLocale(page, 'en')
    await expect(localeTrigger(page)).toHaveText('en')
  })
})

test.describe('i18n — chrome translations', () => {
  test('sidebar chrome labels follow the active locale', async ({ page }) => {
    await page.goto('/')
    const aside = sidebar(page)

    // EN — `common:home` resolves to "Home".
    await expect(aside.getByRole('link', { name: 'Home', exact: true })).toBeVisible()

    await switchLocale(page, 'ru')

    // RU — `common:home` → "Главная".
    await expect(aside.getByRole('link', { name: 'Главная', exact: true })).toBeVisible()
  })

  test('list-page toolbar buttons follow the active locale', async ({ page }) => {
    await page.goto('/resources/posts')
    // Wait for the table to populate so the toolbar is mounted.
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })

    // EN — `common:new` / `common:filters`.
    await expect(page.getByRole('button', { name: 'New', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Filters', exact: true }).first()).toBeVisible()

    await switchLocale(page, 'ru')

    await expect(page.getByRole('button', { name: 'Создать', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Фильтры', exact: true }).first()).toBeVisible()
  })

  test('theme menu labels follow the active locale', async ({ page }) => {
    await page.goto('/')

    const themeTriggerEn = page.getByRole('button', { name: 'Toggle theme' })
    await expect(themeTriggerEn).toBeVisible()
    await themeTriggerEn.click()
    const themeMenu = page.getByRole('menu')
    await expect(themeMenu).toBeVisible()
    // `common:themeLight`, `common:themeDark`, `common:themeSystem` keys.
    await expect(themeMenu.getByRole('menuitem', { name: /^Light$/ })).toBeVisible()
    await expect(themeMenu.getByRole('menuitem', { name: /^Dark$/ })).toBeVisible()
    await expect(themeMenu.getByRole('menuitem', { name: /^System$/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(themeMenu).toBeHidden()

    await switchLocale(page, 'ru')

    const themeTriggerRu = page.getByRole('button', { name: 'Переключить тему' })
    await expect(themeTriggerRu).toBeVisible()
    await themeTriggerRu.click()
    const themeMenuRu = page.getByRole('menu')
    await expect(themeMenuRu).toBeVisible()
    await expect(themeMenuRu.getByRole('menuitem', { name: /^Светлая$/ })).toBeVisible()
    await expect(themeMenuRu.getByRole('menuitem', { name: /^Тёмная$/ })).toBeVisible()
    await expect(themeMenuRu.getByRole('menuitem', { name: /^Системная$/ })).toBeVisible()
    await page.keyboard.press('Escape')
  })
})

test.describe('i18n — resource metadata translations', () => {
  test('sidebar resource label switches between en and ru', async ({ page }) => {
    await page.goto('/')
    const aside = sidebar(page)

    // EN — `resources.posts.label` = "Posts". By default the sidebar
    // hides the raw id suffix (opt-in via runtime config
    // `showSidebarResourceIds`), so the accessible link name is exact.
    await expect(aside.getByRole('link', { name: 'Posts', exact: true }).first()).toBeVisible()

    await switchLocale(page, 'ru')

    // RU — `resources.posts.label` = "Посты".
    await expect(aside.getByRole('link', { name: 'Посты', exact: true }).first()).toBeVisible()
  })

  test('navigation group label switches between en and ru', async ({ page }) => {
    await page.goto('/')
    const aside = sidebar(page)

    // EN — `navigation.groups.Content` = "Content" (the group toggle is a
    // `<button>` with the group label as its text).
    await expect(aside.getByRole('button', { name: /^Content$/ })).toBeVisible()

    await switchLocale(page, 'ru')

    // RU — `navigation.groups.Content` = "Контент".
    await expect(aside.getByRole('button', { name: /^Контент$/ })).toBeVisible()
  })

  test('sidebar hides the raw resource id suffix by default', async ({ page }) => {
    await page.goto('/')
    const aside = sidebar(page)

    // The demo runtime config (`apps/web/src/main.tsx`) does NOT opt into
    // `showSidebarResourceIds`, so even though the localized label
    // "Posts" / "Посты" differs from the id "posts", the sidebar link
    // surfaces only the label — no "(posts)" suffix.
    await expect(aside.locator('a:has-text("(posts)")')).toHaveCount(0)
    await expect(aside.getByRole('link', { name: 'Posts', exact: true }).first()).toBeVisible()

    await switchLocale(page, 'ru')

    await expect(aside.locator('a:has-text("(posts)")')).toHaveCount(0)
    await expect(aside.getByRole('link', { name: 'Посты', exact: true }).first()).toBeVisible()
  })

  test('home-page resource tile reflects the localized label and id', async ({
    page,
  }) => {
    await page.goto('/')

    // Home page lists resource tiles via `useResources()` → each card
    // renders `r.name` and (when different from `r.id`) the raw id below.
    // We scope to `main` to avoid colliding with the sidebar entries.
    const main = page.locator('main')

    await expect(main.getByText('Posts', { exact: true }).first()).toBeVisible()
    await expect(main.getByText('posts', { exact: true }).first()).toBeVisible()

    await switchLocale(page, 'ru')

    await expect(main.getByText('Посты', { exact: true }).first()).toBeVisible()
    await expect(main.getByText('posts', { exact: true }).first()).toBeVisible()
  })
})

test.describe('i18n — list page property labels', () => {
  test('posts: column headers switch between en and ru', async ({ page }) => {
    await page.goto('/resources/posts')
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })

    // EN column headers from `resources.posts.properties.*.label`.
    await expect(page.getByRole('columnheader', { name: 'Post title' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Excerpt' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Author' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Category' })).toBeVisible()

    await switchLocale(page, 'ru')

    // RU — same keys resolved in Russian.
    await expect(page.getByRole('columnheader', { name: 'Заголовок поста' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Краткое описание' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Автор' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Категория' })).toBeVisible()
  })

  test('customers: column headers switch between en and ru', async ({ page }) => {
    await page.goto('/resources/customers')
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })

    // EN — `resources.customers.properties.*.label`.
    await expect(page.getByRole('columnheader', { name: 'Email' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Full name' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Phone' })).toBeVisible()

    await switchLocale(page, 'ru')

    // RU.
    await expect(page.getByRole('columnheader', { name: 'Email' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Полное имя' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Телефон' })).toBeVisible()
  })

  test('products: column headers switch between en and ru', async ({ page }) => {
    await page.goto('/resources/products')
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })

    // EN — `resources.products.properties.*.label`.
    await expect(page.getByRole('columnheader', { name: 'Product name' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Price' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'In stock' })).toBeVisible()

    await switchLocale(page, 'ru')

    // RU.
    await expect(page.getByRole('columnheader', { name: 'Название товара' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Цена' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'В наличии' })).toBeVisible()
  })

  test('switching locale on the customers list flips toolbar chrome', async ({
    page,
  }) => {
    await page.goto('/resources/customers')
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })

    // EN — `common:new` / `common:filters` (chrome).
    await expect(page.getByRole('button', { name: 'New', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Filters', exact: true }).first()).toBeVisible()

    await switchLocale(page, 'ru')

    await expect(page.getByRole('button', { name: 'Создать', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Фильтры', exact: true }).first()).toBeVisible()
  })
})

test.describe('i18n — action labels', () => {
  test('row action menu labels follow the active locale (posts.publish)', async ({
    page,
  }) => {
    await page.goto('/resources/posts')
    const firstRow = page.locator('tbody tr').first()
    await expect(firstRow).toBeVisible({ timeout: 15_000 })

    // EN — `common:openMenu` = "Open menu", `resources.posts.actions.publish.label`
    // and the symmetrical `.unpublish.label` (only one is visible per row
    // depending on the `published` flag).
    await firstRow.getByRole('button', { name: 'Open menu' }).click()
    const menuEn = page.getByRole('menu')
    await expect(menuEn).toBeVisible()
    // The menu lists both `publish` and `unpublish` as menuitems (server
    // exposes the descriptors; `isVisible` is evaluated client-side and
    // doesn't prune the items in the demo source). Asserting `.first()`
    // proves the localized custom label landed in the menu.
    await expect(
      menuEn.getByRole('menuitem', { name: /^(Publish|Unpublish)$/ }).first(),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menuEn).toBeHidden()

    await switchLocale(page, 'ru')

    // RU — `common:openMenu` = "Открыть меню", action labels:
    //   resources.posts.actions.publish.label   → "Опубликовать"
    //   resources.posts.actions.unpublish.label → "Снять с публикации"
    await firstRow.getByRole('button', { name: 'Открыть меню' }).click()
    const menuRu = page.getByRole('menu')
    await expect(menuRu).toBeVisible()
    await expect(
      menuRu.getByRole('menuitem', { name: /^(Опубликовать|Снять с публикации)$/ }).first(),
    ).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('row action menu retranslates without leaving the page', async ({ page }) => {
    // Guards against a regression where the resource metadata is cached
    // post-mount and the menu sticks to the initial locale.
    await page.goto('/resources/posts')
    const firstRow = page.locator('tbody tr').first()
    await expect(firstRow).toBeVisible({ timeout: 15_000 })

    await switchLocale(page, 'ru')

    await firstRow.getByRole('button', { name: 'Открыть меню' }).click()
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    // Built-in row actions must also be localized.
    await expect(menu.getByRole('menuitem', { name: 'Просмотр', exact: true })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Редактировать', exact: true })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Удалить', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
  })
})

test.describe('i18n — persistence', () => {
  test('selected locale is persisted in localStorage and survives a hard reload', async ({
    page,
  }) => {
    await page.goto('/')

    // Default boot is en (no `modern-admin:locale` in fresh storage state).
    expect(
      await page.evaluate(() => localStorage.getItem('modern-admin:locale')),
    ).toBeNull()

    await switchLocale(page, 'ru')
    await expect(
      sidebar(page).getByRole('link', { name: 'Главная', exact: true }),
    ).toBeVisible()

    // The provider writes the choice to localStorage under a well-known key
    // (`STORAGE_KEY` in `packages/react/src/i18n.tsx`).
    const stored = await page.evaluate(() =>
      localStorage.getItem('modern-admin:locale'),
    )
    expect(stored).toBe('ru')

    await page.reload()

    // After reload the trigger and chrome must come back up in Russian.
    await expect(localeTrigger(page)).toHaveText('ru')
    await expect(
      sidebar(page).getByRole('link', { name: 'Главная', exact: true }),
    ).toBeVisible()
  })
})
