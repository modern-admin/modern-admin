import { expect, test, type APIRequestContext } from '@playwright/test'
import { chooseItem, menuOf, openSubmenu } from './_menu.js'

/**
 * End-to-end coverage for resource-level custom actions that render their
 * own UI — the AdminJS `actionType: 'resource'` + `component` pattern.
 *
 * The reference app registers `bulkRepriceUi` on `products`
 * (`apps/_shared/src/admin/products/products.controller.ts`) with
 * `component: 'bulk-reprice'`, whose React implementation is registered on
 * the ComponentLoader in `apps/web/src/admin-components.tsx`.
 *
 * The flow this pins down:
 *   • The toolbar "Actions" dropdown lists the action under its nesting.
 *   • Clicking it does NOT fire the action — it routes to
 *     `/resources/products/actions/bulkRepriceUi`.
 *   • Opening that page issues a priming `GET` on the same endpoint, so the
 *     handler runs with `method: 'get'` and the component renders the
 *     numbers it returned.
 *   • Submitting the component's form POSTs the payload; the handler's
 *     `notice` is toasted and the page returns to the list.
 *   • The mutation actually landed (verified through the API).
 *
 * The REST surface itself is covered by `custom-actions-api.spec.ts`; this
 * spec exists to catch regressions in the UI wiring (route, ComponentLoader
 * lookup, priming query, payload plumbing).
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`
const ACTION_PATH = '/admin/api/resources/products/actions/bulkRepriceUi'

interface PriceSpan {
  total: number
  minPrice: number
  maxPrice: number
}

/** Read the action's own GET projection — the same numbers the component
 *  renders, so assertions compare like with like. */
async function readPriceSpan(request: APIRequestContext): Promise<PriceSpan> {
  const res = await request.get(adminApi('/resources/products/actions/bulkRepriceUi'))
  expect(res.ok(), `priming GET failed: ${await res.text()}`).toBeTruthy()
  return (await res.json()) as PriceSpan
}

test.describe('Resource-action UI — products.bulkRepriceUi', () => {
  test('the toolbar action opens its component page, primes it, and submits', async ({
    page,
    request,
  }) => {
    const before = await readPriceSpan(request)
    expect(before.total).toBeGreaterThan(0)

    await page.goto('/resources/products')
    await expect(
      page.getByRole('heading', { name: /products/i }).first(),
    ).toBeVisible({ timeout: 15_000 })

    // The toolbar ActionMenu — labelled "Actions" via i18n, sitting between
    // Export and "New". Nested one level under the action's `nesting`.
    await page.getByRole('button', { name: /^actions$/i }).first().click()
    const toolbar = menuOf(page, /^actions$/i)
    await expect(toolbar).toBeVisible({ timeout: 5_000 })
    const merchandising = await openSubmenu(page, toolbar, /^merchandising$/i)

    // Choosing an action that declares a `component` must navigate rather
    // than fire — the priming GET is the only request it may make.
    const primePromise = page.waitForResponse(
      (res) => res.url().includes(ACTION_PATH) && res.request().method() === 'GET',
    )
    await chooseItem(merchandising, /bulk reprice/i)

    await expect(page).toHaveURL(/\/resources\/products\/actions\/bulkRepriceUi$/)
    const primeRes = await primePromise
    expect(primeRes.ok(), `priming GET failed: ${await primeRes.text()}`).toBeTruthy()

    // Page chrome comes from ResourceActionPage; the body is the registered
    // component rendering the primed numbers.
    await expect(page.getByRole('heading', { name: /bulk reprice/i })).toBeVisible()
    await expect(
      page.getByText(`${before.total} products, prices from`),
    ).toBeVisible({ timeout: 10_000 })

    const percentInput = page.getByRole('spinbutton', { name: /change by/i })
    await percentInput.fill('10')

    const submitPromise = page.waitForResponse(
      (res) => res.url().includes(ACTION_PATH) && res.request().method() === 'POST',
    )
    await page.getByRole('button', { name: /^apply$/i }).click()
    const submitRes = await submitPromise
    expect(submitRes.ok(), `submit failed: ${await submitRes.text()}`).toBeTruthy()
    expect((await submitRes.json()).updated).toBe(before.total)

    // `close()` returns the operator to the list.
    await expect(page).toHaveURL(/\/resources\/products(\?.*)?$/, { timeout: 10_000 })

    // The mutation landed: every finite price went up by 10%.
    const after = await readPriceSpan(request)
    expect(after.maxPrice).toBeCloseTo(Math.round(before.maxPrice * 1.1 * 100) / 100, 2)

    // Put the catalogue back where we found it so reruns stay stable.
    const restore = await request.post(adminApi('/resources/products/actions/bulkRepriceUi'), {
      data: { percent: -(10 / 1.1) },
    })
    expect(restore.ok()).toBeTruthy()
  })

  test('a bulk action with a component carries the selection into its page', async ({
    page,
    request,
  }) => {
    // `posts.scheduleManyUi` is `actionType: 'bulk'` + `component:
    // 'schedule-posts'`. The selection must survive the hop to the action
    // page (encoded as `?recordIds=`), reach the priming GET so the handler
    // can hand back the records, and reach the POST so it mutates the right
    // rows.
    await page.goto('/resources/posts?perPage=20&sortBy=id&direction=desc')
    await expect(
      page.getByRole('heading', { name: /posts/i }).first(),
    ).toBeVisible({ timeout: 15_000 })

    // Skip the `aria-busy` placeholder rows the table renders while loading —
    // they carry no checkbox, so `nth(0)` would resolve to a dead node.
    const rows = page.locator('tbody tr:not([aria-busy="true"])')
    await expect(rows.first()).toBeVisible({ timeout: 15_000 })
    await rows.nth(0).getByRole('checkbox', { name: /^select row$/i }).check()
    await rows.nth(1).getByRole('checkbox', { name: /^select row$/i }).check()
    await expect(page.getByText(/^2 selected$/i)).toBeVisible({ timeout: 5_000 })

    const primePromise = page.waitForResponse(
      (res) =>
        res.url().includes('/admin/api/resources/posts/actions/scheduleManyUi') &&
        res.request().method() === 'GET',
    )
    await page.getByRole('button', { name: /^actions$/i }).first().click()
    const bulkMenu = menuOf(page, /^actions$/i)
    await expect(bulkMenu).toBeVisible({ timeout: 5_000 })
    await chooseItem(bulkMenu, /schedule selected/i)

    await expect(page).toHaveURL(/\/resources\/posts\/actions\/scheduleManyUi\?recordIds=/)
    const primeRes = await primePromise
    expect(primeRes.ok(), `priming GET failed: ${await primeRes.text()}`).toBeTruthy()
    // The handler echoed `ctx.records` back, so the component lists them.
    const primed = (await primeRes.json()) as { records: Array<{ id: string; title: string }> }
    expect(primed.records).toHaveLength(2)
    await expect(page.getByText('Scheduling 2 post(s):')).toBeVisible({ timeout: 10_000 })

    await page.getByRole('textbox', { name: /publish at/i }).fill('2029-04-05T08:15')

    const submitPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/admin/api/resources/posts/actions/scheduleManyUi') &&
        res.request().method() === 'POST',
    )
    await page.getByRole('button', { name: /^schedule$/i }).click()
    const submitRes = await submitPromise
    expect(submitRes.ok(), `submit failed: ${await submitRes.text()}`).toBeTruthy()

    await expect(page).toHaveURL(/\/resources\/posts(\?.*)?$/, { timeout: 10_000 })

    // Only the two selected posts moved.
    for (const rec of primed.records) {
      const res = await request.get(adminApi(`/resources/posts/records/${rec.id}/actions/show`))
      expect(res.ok()).toBeTruthy()
      const params = (await res.json()).record.params as { publishedAt?: string }
      expect(String(params.publishedAt)).toContain('2029-04-05')
    }
  })

  test('an action with no component still fires directly from the menu', async ({ page }) => {
    // `markFeaturedPalette` has `component: null` — the menu must POST it
    // immediately instead of routing anywhere.
    await page.goto('/resources/products')
    await expect(
      page.getByRole('heading', { name: /products/i }).first(),
    ).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: /^actions$/i }).first().click()
    const toolbar = menuOf(page, /^actions$/i)
    await expect(toolbar).toBeVisible({ timeout: 5_000 })
    const merchandising = await openSubmenu(page, toolbar, /^merchandising$/i)
    const colors = await openSubmenu(page, merchandising, /^colors$/i)

    const postPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/admin/api/resources/products/actions/markFeaturedPalette') &&
        res.request().method() === 'POST',
    )
    await chooseItem(colors, /apply featured palette/i)
    const res = await postPromise
    expect(res.ok(), `markFeaturedPalette failed: ${await res.text()}`).toBeTruthy()

    // Stayed on the list — no action page was routed to.
    await expect(page).toHaveURL(/\/resources\/products(\?.*)?$/)
  })
})
