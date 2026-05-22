import { test, expect, type Page } from '@playwright/test'

/**
 * Regression coverage for the list-page layout — exercises the seeded `posts`
 * resource (200 rows ⇒ 10 page-buttons at perPage=20) which is the only seeded
 * resource large enough to make the pagination row overflow on a 375-wide
 * viewport. Each test asserts behaviour we've previously had bugs in:
 *
 *   • Mobile viewport must NOT develop a second, page-level scrollbar that
 *     drags the entire layout into empty background. The inner `<main>`
 *     scrolls; the document does not.
 *   • The sticky paginator pins to the viewport bottom while the table area
 *     scrolls behind it.
 *   • Records-count label and the per-page select sit on a single row on
 *     mobile (saves vertical real estate inside the sticky panel).
 *   • The `<<` / `>>` chevrons render on mobile too, reachable via the
 *     drag-scrollable buttons row.
 *   • The buttons row supports mouse click-and-drag horizontal scroll,
 *     mirroring the table wrapper.
 */

const MOBILE = { width: 375, height: 700 }
const DESKTOP = { width: 1280, height: 800 }

const POSTS_PATH = '/resources/posts'

async function gotoPostsList(page: Page): Promise<void> {
  await page.goto(POSTS_PATH)
  // The list page mounts when the sticky paginator appears.
  await expect(page.locator('.sticky.bottom-0')).toBeVisible({ timeout: 15_000 })
}

test.describe('List page layout — mobile (375 × 700)', () => {
  test.use({ viewport: MOBILE })

  test('does not develop a second, page-level scrollbar', async ({ page }) => {
    await gotoPostsList(page)
    const metrics = await page.evaluate(() => ({
      htmlSh: document.documentElement.scrollHeight,
      htmlCh: document.documentElement.clientHeight,
      bodySh: document.body.scrollHeight,
      bodyCh: document.body.clientHeight,
    }))
    expect(metrics.htmlSh).toBe(metrics.htmlCh)
    expect(metrics.bodySh).toBe(metrics.bodyCh)

    // Try to scroll the window; verify scrollY stays 0.
    const winScrolledBy = await page.evaluate(() => {
      window.scrollBy(0, 500)
      const y = window.scrollY
      window.scrollTo(0, 0)
      return y
    })
    expect(winScrolledBy).toBe(0)
  })

  test('records-count and per-page select live on a single row', async ({ page }) => {
    await gotoPostsList(page)
    const recordsLabel = page.locator('.sticky.bottom-0').getByText(/\b\d+\b\s+records?\b/i)
    const perPageTrigger = page
      .locator('.sticky.bottom-0 button[role="combobox"]')
      .first()
    await expect(recordsLabel).toBeVisible()
    await expect(perPageTrigger).toBeVisible()
    const [labelBox, triggerBox] = await Promise.all([
      recordsLabel.boundingBox(),
      perPageTrigger.boundingBox(),
    ])
    expect(labelBox).not.toBeNull()
    expect(triggerBox).not.toBeNull()
    // Vertical centres should coincide within a few px — same flex row.
    const labelMid = labelBox!.y + labelBox!.height / 2
    const triggerMid = triggerBox!.y + triggerBox!.height / 2
    expect(Math.abs(labelMid - triggerMid)).toBeLessThan(8)
  })

  test('first/last page chevrons render on mobile', async ({ page }) => {
    await gotoPostsList(page)
    const scrollRow = page.locator('.sticky.bottom-0 .overflow-x-auto').first()
    await expect(scrollRow).toBeVisible()
    const buttonCount = await scrollRow.locator('button').count()
    // 10 numbered pages + 2 single-step chevrons + 2 jump-to-end chevrons.
    expect(buttonCount).toBe(14)
  })

  test('pagination buttons row supports click-and-drag scrolling', async ({ page }) => {
    await gotoPostsList(page)
    // Engage the drag-scroll handler by dispatching pointer events directly.
    // Playwright's mouse helpers fire `mousedown/mousemove` rather than
    // PointerEvents, so the listener (which filters on `pointerType==='mouse'`)
    // never sees them. Direct dispatch is the reliable path.
    const result = await page.evaluate(() => {
      const row = document.querySelector(
        '.sticky.bottom-0 .overflow-x-auto',
      ) as HTMLDivElement | null
      if (!row) return { error: 'no scroll row' }
      row.scrollLeft = 0
      const r = row.getBoundingClientRect()
      const startX = r.left + 80
      const y = r.top + r.height / 2
      row.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerType: 'mouse',
          button: 0,
          clientX: startX,
          clientY: y,
          pointerId: 1,
          bubbles: true,
        }),
      )
      row.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerType: 'mouse',
          clientX: startX - 60,
          clientY: y,
          pointerId: 1,
          bubbles: true,
        }),
      )
      row.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerType: 'mouse',
          clientX: startX - 140,
          clientY: y,
          pointerId: 1,
          bubbles: true,
        }),
      )
      const scrolled = row.scrollLeft
      row.dispatchEvent(
        new PointerEvent('pointerup', {
          pointerType: 'mouse',
          clientX: startX - 140,
          clientY: y,
          pointerId: 1,
          bubbles: true,
        }),
      )
      return { scrolled, scrollWidth: row.scrollWidth, clientWidth: row.clientWidth }
    })
    expect('error' in result ? result.error : null).toBeNull()
    if (!('scrolled' in result)) throw new Error('drag did not execute')
    // Buttons row must overflow (otherwise there's nothing to test).
    expect(result.scrollWidth).toBeGreaterThan(result.clientWidth)
    // Dragging 140px left should translate to ~140px of scrollLeft.
    expect(result.scrolled).toBeGreaterThanOrEqual(100)
  })
})

test.describe('List page layout — desktop (1280 × 800)', () => {
  test.use({ viewport: DESKTOP })

  test('sticky paginator stays pinned to the viewport bottom while list scrolls', async ({
    page,
  }) => {
    await gotoPostsList(page)
    const sticky = page.locator('.sticky.bottom-0')
    await expect(sticky).toBeVisible()

    const viewportHeight = page.viewportSize()!.height

    // Initial pin: bottom touches viewport bottom.
    const before = await sticky.boundingBox()
    expect(before).not.toBeNull()
    expect(Math.abs(before!.y + before!.height - viewportHeight)).toBeLessThan(2)

    // Scroll the inner <main overflow-auto> to the bottom — sticky must remain
    // pinned (not scroll out with content).
    await page.evaluate(() => {
      const inner = Array.from(document.querySelectorAll('main')).find((m) =>
        m.className.includes('overflow-auto'),
      ) as HTMLElement | undefined
      if (inner) inner.scrollTop = inner.scrollHeight
    })
    const after = await sticky.boundingBox()
    expect(after).not.toBeNull()
    expect(Math.abs(after!.y + after!.height - viewportHeight)).toBeLessThan(2)
  })

  test('table wrapper supports click-and-drag horizontal scrolling', async ({ page }) => {
    await gotoPostsList(page)
    const result = await page.evaluate(() => {
      // Table wrapper is the desktop-only `overflow-x-auto` next to the table.
      const wrapper = document.querySelector(
        'div.overflow-x-auto.cursor-grab',
      ) as HTMLDivElement | null
      if (!wrapper) return { error: 'no table wrapper' }
      if (wrapper.scrollWidth <= wrapper.clientWidth)
        return { error: 'wrapper not overflowing' }
      wrapper.scrollLeft = 0
      const r = wrapper.getBoundingClientRect()
      const startX = r.left + 200
      const y = r.top + 60
      const fire = (type: string, x: number) =>
        wrapper.dispatchEvent(
          new PointerEvent(type, {
            pointerType: 'mouse',
            button: 0,
            clientX: x,
            clientY: y,
            pointerId: 1,
            bubbles: true,
          }),
        )
      fire('pointerdown', startX)
      fire('pointermove', startX - 80)
      fire('pointermove', startX - 180)
      const scrolled = wrapper.scrollLeft
      fire('pointerup', startX - 180)
      return { scrolled }
    })
    expect('error' in result ? result.error : null).toBeNull()
    if (!('scrolled' in result)) throw new Error('drag did not execute')
    expect(result.scrolled).toBeGreaterThanOrEqual(120)
  })
})
