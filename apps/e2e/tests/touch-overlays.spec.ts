import { expect, test, type Locator, type Page } from '@playwright/test'
import { uuidv7 } from '@modern-admin/core'

const FIELD_HINT = 'A name shown to other administrators.'
const SAVE_ERROR = 'Unable to save the webhook.'

// Exercise the real admin shell with deterministic API responses. No stored
// records or credentials are needed for these pointer/focus regressions.
test.beforeEach(async ({ page }) => {
  const adminId = uuidv7()
  await page.route('**/admin/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/me')) {
      await route.fulfill({ json: { user: { id: adminId, name: 'Touch test admin' } } })
    } else if (path.endsWith('/config')) {
      await route.fulfill({
        json: {
          rootPath: '/',
          auth: {},
          features: { webhooks: true },
          resources: [
            {
              id: 'customers',
              name: 'Customers',
              navigation: {},
              properties: [
                {
                  path: 'name',
                  label: 'Name',
                  description: FIELD_HINT,
                  type: 'string',
                  isId: false,
                  isSortable: true,
                  isRequired: false,
                  isDisabled: false,
                  isArray: false,
                  reference: null,
                  availableValues: null,
                  components: {},
                  custom: {},
                  position: 0,
                  visibility: { list: true, show: true, edit: true, new: true, filter: true },
                },
              ],
              actions: [
                { name: 'list', actionType: 'resource', resourceId: 'customers' },
                { name: 'new', actionType: 'resource', resourceId: 'customers' },
              ],
            },
          ],
        },
      })
    } else if (path.endsWith('/webhooks')) {
      await route.fulfill(
        route.request().method() === 'POST'
          ? { status: 400, json: { message: SAVE_ERROR } }
          : { json: { webhooks: [] } },
      )
    } else {
      await route.fulfill({ status: 404, json: { message: `Unexpected test request: ${path}` } })
    }
  })
})

async function openWebhookEditor(page: Page): Promise<Locator> {
  await page.goto('/settings/webhooks')
  await page.getByRole('button', { name: 'New webhook', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New webhook', exact: true })
  await expect(dialog).toBeVisible()
  return dialog
}

async function showErrorToast(page: Page, dialog: Locator): Promise<Locator> {
  await dialog.locator('input[required]').first().fill('Touch test webhook')
  await dialog.locator('input[type="url"]').fill('https://example.com/webhook')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: SAVE_ERROR })
  await expect(toast).toBeVisible()
  return toast
}

type SwipeDirection = 'left' | 'right' | 'top' | 'bottom'

async function swipeToast(page: Page, toast: Locator, direction: SwipeDirection): Promise<void> {
  // Wait for the toast's entrance animation before using viewport coordinates.
  await toast.tap({ trial: true })
  const box = await toast.boundingBox()
  expect(box).not.toBeNull()
  const x = box!.x + box!.width / 2
  // An upward swipe starts near the bottom so it has enough travel without
  // sending touch coordinates above the viewport's top edge.
  const y = box!.y + (direction === 'top' ? box!.height - 8 : box!.height / 2)
  const deltaX = direction === 'left' ? -120 : direction === 'right' ? 120 : 0
  const deltaY = direction === 'top' ? -Math.min(120, y - 4) : direction === 'bottom' ? 120 : 0
  const session = await page.context().newCDPSession(page)
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    })
    for (let step = 1; step <= 6; step++) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x + (deltaX * step) / 6, y: y + (deltaY * step) / 6 }],
      })
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      )
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } finally {
    await session.detach()
  }
}

test.describe('Touch overlays (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })

  test('a label hint stays open after a tap and closes on a second or outside tap', async ({
    page,
  }) => {
    await page.goto('/resources/customers/new')
    const trigger = page.getByRole('button', { name: FIELD_HINT, exact: true })
    const hint = page.getByRole('dialog', { name: FIELD_HINT, exact: true })
    await trigger.tap()
    await expect(hint).toBeVisible()
    await expect(trigger).toBeFocused()
    // Touch-generated mouse events and blur must not collapse the hint.
    await expect(page.getByRole('textbox', { name: /name/i })).not.toBeFocused()
    await trigger.tap()
    await expect(hint).toBeHidden()
    await trigger.tap()
    await expect(hint).toBeVisible()
    await page.getByRole('textbox', { name: /name/i }).tap()
    await expect(hint).toBeHidden()
  })

  test('a hint inside a modal stays open and does not close the editor', async ({ page }) => {
    const dialog = await openWebhookEditor(page)
    const trigger = dialog.getByRole('button', { name: 'Signing secret', exact: true })
    const hint = dialog.getByRole('dialog', { name: 'Signing secret', exact: true })
    await trigger.tap()
    await expect(hint).toBeVisible()
    await expect(trigger).toBeFocused()
    await trigger.tap()
    await expect(hint).toBeHidden()
    await expect(dialog).toBeVisible()
  })

  test('a toast close button responds to touch while a modal is open', async ({ page }) => {
    const dialog = await openWebhookEditor(page)
    const toast = await showErrorToast(page, dialog)
    await toast.locator('[data-close-button]').tap()
    await expect(toast).toHaveCount(0, { timeout: 1_000 })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('input[required]').first()).toHaveValue('Touch test webhook')
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).tap()
    await expect(dialog).toBeHidden()
  })

  for (const direction of ['left', 'right', 'top', 'bottom'] as const) {
    test(`a toast swipes ${direction} while keeping the modal open`, async ({ page }) => {
      const dialog = await openWebhookEditor(page)
      const toast = await showErrorToast(page, dialog)
      await swipeToast(page, toast, direction)
      // Fail before Sonner's normal timeout can hide a broken swipe.
      await expect(toast).toHaveCount(0, { timeout: 1_000 })
      await expect(dialog).toBeVisible()
    })
  }
})

test.describe('Desktop overlay interactions', () => {
  test('label hints still open on mouse hover and keyboard focus', async ({ page }) => {
    await page.goto('/resources/customers/new')
    const trigger = page.getByRole('button', { name: FIELD_HINT, exact: true })
    await trigger.hover()
    await expect(page.getByRole('tooltip')).toHaveText(FIELD_HINT)
    await page.mouse.move(0, 0, { steps: 5 })
    await expect(page.getByRole('tooltip')).toBeHidden()
    await trigger.focus()
    await expect(page.getByRole('tooltip')).toHaveText(FIELD_HINT)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip')).toBeHidden()
  })

  test('a toast close button responds to a mouse click while a modal is open', async ({ page }) => {
    const dialog = await openWebhookEditor(page)
    const toast = await showErrorToast(page, dialog)
    await toast.locator('[data-close-button]').click()
    await expect(toast).toHaveCount(0, { timeout: 1_000 })
    await expect(dialog).toBeVisible()
  })
})
