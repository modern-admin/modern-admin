import { expect, test, type APIRequestContext } from '@playwright/test'

/**
 * Richtext property (`posts.body`) — the reference deployment's showcase of
 * the lazily-loaded tiptap editor chunk (`heavy-fields`). Verifies:
 *   • The body column is hidden from the list (rich HTML would be noise in a
 *     table cell — the property is configured `isVisible.list = false`).
 *   • The edit form mounts the tiptap editor and hydrates it from the stored
 *     HTML, and the heavy editor chunk is fetched only when that form renders
 *     (never on the list/dashboard) — this is the payoff of the lazy split.
 *   • An edit to the body round-trips through PATCH and persists.
 *
 * Posts are looked up by id via the API (never by list position — orphan
 * accumulation shifts positional rows, per the e2e pagination rule).
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

async function firstPost(
  request: APIRequestContext,
): Promise<{ id: string; body: string }> {
  const res = await request.get(adminApi('/resources/posts/actions/list?perPage=1'))
  expect(res.ok(), `posts list failed: ${res.status()}`).toBeTruthy()
  const json = await res.json()
  const record = json.records?.[0]
  expect(record, 'expected at least one seeded post').toBeTruthy()
  return { id: String(record.id), body: String(record.params.body ?? '') }
}

const editor = 'form .ProseMirror, form [contenteditable="true"]'

test.describe('Richtext field — posts.body', () => {
  test('body column is hidden from the posts list', async ({ page }) => {
    await page.goto('/resources/posts?perPage=25')
    await expect(page.locator('table thead th').first()).toBeVisible({ timeout: 10_000 })
    const headers = await page.locator('table thead th').allTextContents()
    expect(headers.some((h) => /^body$/i.test(h.trim()))).toBe(false)
  })

  test('edit form mounts the tiptap editor lazily and hydrates from stored HTML', async ({
    page,
    request,
  }) => {
    const post = await firstPost(request)

    // Track network for the lazily-split editor chunk. In dev the module is
    // served as a source file (`heavy-fields.ts`); in a built bundle it is a
    // hashed `heavy-fields-*.js`. Match either.
    const heavyChunkRequests: string[] = []
    page.on('request', (req) => {
      if (/heavy-fields/.test(req.url())) heavyChunkRequests.push(req.url())
    })

    // Land on the list first so we can assert the chunk is NOT pulled there.
    await page.goto('/resources/posts?perPage=25')
    await expect(page.locator('table thead th').first()).toBeVisible({ timeout: 10_000 })
    expect(
      heavyChunkRequests,
      'richtext editor chunk must not load on the list page',
    ).toHaveLength(0)

    // Now open the record's edit form — the editor (and its chunk) appears.
    await page.goto(`/resources/posts/${post.id}/edit`)
    await expect(page.locator(editor)).toBeVisible({ timeout: 15_000 })
    expect(
      heavyChunkRequests.length,
      'richtext editor chunk should load when the form renders',
    ).toBeGreaterThan(0)

    // Hydrated from the seeded HTML — the body has paragraphs and a heading,
    // so the editor's text content is non-trivial.
    await expect
      .poll(async () => (await page.locator(editor).textContent())?.trim().length ?? 0, {
        timeout: 10_000,
      })
      .toBeGreaterThan(20)
  })

  test('editing the body persists via PATCH', async ({ page, request }) => {
    const post = await firstPost(request)
    const marker = `E2E richtext edit ${Date.now()}`

    await page.goto(`/resources/posts/${post.id}/edit`)
    const body = page.locator(editor)
    await expect(body).toBeVisible({ timeout: 15_000 })

    // Append a marker paragraph: focus the editor, jump to the end, type.
    await body.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Enter')
    await page.keyboard.type(marker)

    const patchPromise = page.waitForResponse(
      (res) =>
        res.url().includes(`/admin/api/resources/posts/records/${post.id}/actions/edit`) &&
        res.request().method() === 'PATCH',
    )
    await page.getByRole('button', { name: 'Save' }).click()
    const patchRes = await patchPromise
    expect(patchRes.ok(), `PATCH failed: ${await patchRes.text()}`).toBeTruthy()

    // Server-side double-check: the stored HTML contains the marker.
    const fetched = await request.get(
      adminApi(`/resources/posts/records/${post.id}/actions/show`),
    )
    expect(fetched.ok()).toBeTruthy()
    const fetchedBody = await fetched.json()
    expect(String(fetchedBody.record.params.body)).toContain(marker)

    // Restore the original body so the fixture stays stable across runs.
    await request.patch(adminApi(`/resources/posts/records/${post.id}/actions/edit`), {
      data: { body: post.body },
    })
  })
})
