import { test, expect, type Page } from '@playwright/test'

/**
 * Regression coverage for unbreakable values on a phone-sized viewport.
 *
 * Record data is arbitrary — an api key, a hash, a url without hyphens or a
 * pasted 200-character word has no break opportunity, and the browser's
 * default `overflow-wrap: normal` then lets the value run past the card
 * instead of wrapping. At 375px the tail is simply clipped and unreadable.
 * The show page (plain values, textarea, richtext body) and the reference
 * badge (renders the referenced record's title) are the surfaces where
 * arbitrary strings are printed at full length.
 *
 * The assertion is layout-level rather than pixel-level: nothing rendered may
 * stick out past the right edge of the viewport.
 */

const MOBILE = { width: 375, height: 800 }
const API = 'http://localhost:3001/admin/api'

/** 120 chars, zero break opportunities. */
const UNBREAKABLE = 'a'.repeat(120)
const TOKEN = 'sk_live_' + 'X9k2Lp7Qw3Zr8Nt5Vb1Md4Hj6Gf0Cs'.repeat(4)

/** Elements whose right edge sticks out past the viewport, with a hint of what they are. */
async function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0) continue
      // 1px slack: sub-pixel rounding of centred/bordered boxes.
      if (rect.right > window.innerWidth + 1) {
        const cls = (el.className ?? '').toString().slice(0, 60)
        out.push(
          `${el.tagName}.${cls} right=${Math.round(rect.right)} "${(el.textContent ?? '').slice(0, 25)}"`,
        )
      }
    }
    return out
  })
}

test.describe('Long values on mobile (375 × 800)', () => {
  test.use({ viewport: MOBILE })

  test('unbreakable values wrap inside the card instead of overflowing', async ({
    page,
    request,
  }) => {
    const stamp = Date.now()
    const created: Array<{ resource: string; id: string }> = []

    try {
      const customer = await (
        await request.post(`${API}/resources/customers/actions/new`, {
          data: {
            email: `long-values-${stamp}@example.com`,
            name: UNBREAKABLE,
            bio: `${TOKEN} plain words in between ${UNBREAKABLE}`,
            tier: 'free',
          },
        })
      ).json()
      expect(customer.record?.id).toBeTruthy()
      created.push({ resource: 'customers', id: customer.record.id })

      // A category whose *title* is unbreakable — the reference badge on the
      // post's show page renders it verbatim.
      const category = await (
        await request.post(`${API}/resources/categories/actions/new`, {
          data: { name: UNBREAKABLE, slug: `long-values-${stamp}` },
        })
      ).json()
      expect(category.record?.id).toBeTruthy()
      created.push({ resource: 'categories', id: category.record.id })

      const post = await (
        await request.post(`${API}/resources/posts/actions/new`, {
          data: {
            title: `Long values ${TOKEN}`,
            excerpt: TOKEN,
            body: `<p>${TOKEN}</p>`,
            authorId: customer.record.id,
            categoryId: category.record.id,
            published: false,
          },
        })
      ).json()
      expect(post.record?.id).toBeTruthy()
      created.push({ resource: 'posts', id: post.record.id })

      // Customer show page — plain string property + textarea.
      await page.goto(`/resources/customers/${customer.record.id}`)
      await expect(page.getByText(UNBREAKABLE).first()).toBeVisible({ timeout: 15_000 })
      expect(await overflowingElements(page)).toEqual([])

      // Post show page — richtext body + the reference badge for the category.
      await page.goto(`/resources/posts/${post.record.id}`)
      await expect(
        page.locator(`a[href*="/resources/categories/${category.record.id}"]`),
      ).toBeVisible({ timeout: 15_000 })
      expect(await overflowingElements(page)).toEqual([])

      // List page — mobile renders record cards, not the (scrollable) table.
      await page.goto(`/resources/customers?filters[email]=long-values-${stamp}@example.com`)
      await expect(page.getByText(UNBREAKABLE).first()).toBeVisible({ timeout: 15_000 })
      expect(await overflowingElements(page)).toEqual([])
    } finally {
      // Leave no orphans behind: other specs page through these resources.
      for (const { resource, id } of created.reverse()) {
        await request.delete(`${API}/resources/${resource}/records/${id}/actions/delete`)
      }
    }
  })
})
