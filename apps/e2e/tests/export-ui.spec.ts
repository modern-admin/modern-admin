import { expect, test, type Download, type Page } from '@playwright/test'

/**
 * End-to-end coverage for the list-page export dialog
 * (`packages/react/src/pages/export-dialog.tsx`). The button is mounted in
 * the list-page header (`packages/react/src/pages/list-page.tsx`) and opens
 * a Radix Dialog with two large buttons: CSV / JSON. Each button kicks off
 * `fetchAllRecords` and then triggers a browser download via
 * `downloadText` → `<a download>.click()`.
 *
 * The spec drives both formats against the seeded `customers` resource:
 *   • Open the dialog from the list-page header.
 *   • Click CSV → wait for the Playwright `download` event, save it to
 *     `.artifacts/`, read it back, verify a header row + ≥ 1 data row.
 *   • Same for JSON, strip the leading `// Query:` JSONC comment and
 *     parse the rest, verify it's a non-empty array of objects.
 *
 * Notes on the file shape (see `packages/react/src/export.ts`):
 *   • CSV body = `\uFEFF` BOM + optional `# Query: {...}\r\n` + header +
 *     CRLF-separated rows. Header uses i18n'd labels, not field paths.
 *   • JSON body = optional `// Query: {...}\n` + pretty-printed JSON array
 *     of `{ id, ...flattenedParams }`. The leading comment makes the file
 *     JSONC, so plain `JSON.parse` rejects it — strip it first.
 */

const ARTIFACTS_DIR = 'playwright/.artifacts'

async function openExportDialog(page: Page): Promise<void> {
  await page.goto('/resources/customers')
  await expect(page.getByRole('heading', { name: /customers/i }).first()).toBeVisible({
    timeout: 15_000,
  })
  await page.getByRole('button', { name: /^export$/i }).first().click()
  await expect(page.getByRole('dialog', { name: /export records/i })).toBeVisible({
    timeout: 10_000,
  })
}

/** Locator for the explicit footer "Close" button (text label), not the
 *  Radix DialogPrimitive.Close that's rendered as a bare `X` icon in the
 *  top-right and exposes its own aria-label="Close". */
function footerCloseButton(dialog: ReturnType<Page['getByRole']>) {
  return dialog.locator('button:has-text("Close")').first()
}

async function saveDownload(download: Download, suggestedName?: string): Promise<string> {
  const name = suggestedName ?? download.suggestedFilename()
  const path = `${ARTIFACTS_DIR}/${name}`
  await download.saveAs(path)
  return path
}

/** Strip the optional `// Query: …` JSONC comment recordsToJson prepends. */
function stripJsonQueryComment(body: string): string {
  return body.replace(/^\s*\/\/[^\n]*\n/, '')
}

/** Strip the optional `# Query: …` CSV comment line + UTF-8 BOM. */
function stripCsvPreamble(body: string): string {
  let out = body.replace(/^\uFEFF/, '')
  out = out.replace(/^\s*#[^\r\n]*\r?\n/, '')
  return out
}

test.describe('Export dialog — list-page (`customers`)', () => {
  test('opens with CSV and JSON options', async ({ page }) => {
    await openExportDialog(page)
    const dialog = page.getByRole('dialog', { name: /export records/i })
    await expect(dialog.getByRole('button', { name: /^csv/i })).toBeVisible()
    await expect(dialog.getByRole('button', { name: /^json/i })).toBeVisible()
    await expect(footerCloseButton(dialog)).toBeVisible()
  })

  test('CSV download contains a header row and at least one data row', async ({
    page,
  }) => {
    await openExportDialog(page)
    const dialog = page.getByRole('dialog', { name: /export records/i })

    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 })
    await dialog.getByRole('button', { name: /^csv/i }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^customers-\d{8}-\d{6}\.csv$/)

    const saved = await saveDownload(download)
    const fs = await import('node:fs/promises')
    const body = await fs.readFile(saved, 'utf8')
    const csv = stripCsvPreamble(body)
    const lines = csv.split(/\r?\n/).filter((l) => l.length > 0)
    // Header + ≥ 1 data row.
    expect(lines.length).toBeGreaterThanOrEqual(2)
    // Header uses the visible-properties' i18n labels — at minimum we know
    // the customers resource exposes a Name column.
    expect(lines[0]!.toLowerCase()).toContain('name')
  })

  test('JSON download is a valid array of record-shaped objects', async ({
    page,
  }) => {
    await openExportDialog(page)
    const dialog = page.getByRole('dialog', { name: /export records/i })

    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 })
    await dialog.getByRole('button', { name: /^json/i }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^customers-\d{8}-\d{6}\.json$/)

    const saved = await saveDownload(download)
    const fs = await import('node:fs/promises')
    const body = await fs.readFile(saved, 'utf8')
    const parsed = JSON.parse(stripJsonQueryComment(body))
    expect(Array.isArray(parsed)).toBe(true)
    expect((parsed as unknown[]).length).toBeGreaterThan(0)
    // Each row is `{ id, ...flattenedParams }`; id is always present.
    const first = parsed[0] as Record<string, unknown>
    expect(first.id).toBeDefined()
  })

  test('Close button dismisses the dialog without triggering a download', async ({
    page,
  }) => {
    await openExportDialog(page)
    const dialog = page.getByRole('dialog', { name: /export records/i })

    let fired = false
    page.on('download', () => {
      fired = true
    })
    await footerCloseButton(dialog).click()
    await expect(dialog).toBeHidden()
    await page.waitForTimeout(500)
    expect(fired).toBe(false)
  })
})
