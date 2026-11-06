import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('radio and toggle groups support arrow-key navigation', async ({ page }) => {
  await page.goto('/ui.html')
  const yes = page.getByRole('radio', { name: 'Yes', exact: true })
  await yes.focus()
  await page.keyboard.down('ArrowDown')
  await expect(page.getByRole('radio', { name: 'No', exact: true })).toBeChecked()
  await page.keyboard.up('ArrowDown')
  const chart = page.getByRole('radio', { name: 'Charts', exact: true })
  await chart.click()
  await expect(chart).toBeChecked()
  await chart.press('ArrowLeft')
  await expect(page.getByRole('radio', { name: '3 records' })).toBeFocused()
})

for (const width of [375, 1280]) {
  for (const dark of [false, true]) {
    test(`gallery at ${width}px, ${dark ? 'dark' : 'light'}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/ui.html')
      await expect(page.getByRole('heading', { name: 'UI kit', exact: true })).toBeVisible()
      if (dark) await page.getByRole('button', { name: 'Toggle theme' }).click()
      await expect(page.locator('main')).toHaveCSS(
        'background-color',
        dark ? 'rgb(12, 12, 13)' : 'rgb(255, 255, 255)',
      )
      // Theme colors transition independently on badges and controls. Audit
      // the settled theme, excluding perpetual spinner animations.
      await page.locator('main').evaluate(async (element) => {
        await Promise.all(
          element
            .getAnimations({ subtree: true })
            .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
            .map((animation) => animation.finished),
        )
      })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
      expect(results.violations).toEqual([])
      await testInfo.attach('gallery', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
      await page.getByRole('button', { name: 'Open calendar' }).click()
      const calendar = page.getByRole('dialog', { name: 'Open calendar' })
      await expect(calendar).toBeVisible()
      await calendar.evaluate(async (element) => {
        await Promise.all(
          element.getAnimations({ subtree: true }).map((animation) => animation.finished),
        )
      })
      await expect(calendar).toHaveCSS(
        'background-color',
        dark ? 'rgb(17, 17, 19)' : 'rgb(255, 255, 255)',
      )
      const calendarResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
      expect(calendarResults.violations).toEqual([])
    })
  }
}

test('gallery translates controls, supports keyboard selection and opens calendars', async ({
  page,
}) => {
  await page.goto('/ui.html')
  const search = page.getByRole('combobox', { name: 'Search', exact: true })
  await search.fill('English')
  await search.press('ArrowDown')
  await expect(search).toHaveAttribute('aria-expanded', 'true')
  await expect(search).toHaveAttribute('aria-activedescendant', /option-/)
  await search.press('Enter')
  await expect(search).toHaveValue('English')
  await expect(search).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('button', { name: 'Open calendar' }).click()
  const calendar = page.getByRole('dialog', { name: 'Open calendar' })
  await expect(calendar).toBeVisible()
  await calendar.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished),
    )
  })
  const calendarAxe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(calendarAxe.violations).toEqual([])
  await page.keyboard.press('Escape')
  await page.getByLabel('Language', { exact: true }).selectOption('ru')
  await expect(page.getByRole('button', { name: 'Показать пароль' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Элементы управления' })).toBeVisible()
})
