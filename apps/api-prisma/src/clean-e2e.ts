// Removes the fixture rows the e2e suite leaves behind in the demo database.
//
// Why this exists
// ---------------
// Most specs create their own row through the REST API and delete it in a
// `finally`, but that cleanup is best-effort: a spec that fails mid-way (or
// deliberately leaves the record in place, like the draft-autosave submit
// test) never gets there. The strays accumulate across runs and eventually
// start breaking tests that assume a page-sized table — a ~100-row list
// re-measures its column widths continuously, which is enough to make
// Playwright's stability check time out on a row-actions click.
//
// What counts as a stray — two conditions, both required
// ------------------------------------------------------
//  1. The id is not one the seed minted. `seed-demo.ts` writes deterministic
//     ids (`00000000-<entity>-4000-8000-<seq>`), so this alone rules the seed
//     out without matching on any content.
//  2. The row's label carries a 13-digit epoch-ms stamp. Every spec builds
//     its fixture name from `Date.now()` (`E2E Customer 1785397054602-rqhssd`,
//     `draft-submit-1785354371984-5da4@example.com`), so this is the
//     fingerprint of *generated* data.
//
// Condition 2 is what makes the script safe to run on a working database:
// records you created by hand while clicking around the demo ("Test phone",
// "Тестовый") also fail condition 1, and deleting those would be a nasty
// surprise. Dropping condition 2 would take them with it.
//
// It also means the script does not care what the fixtures are *called* —
// renaming a spec's fixture never silently stops the cleanup working.
//
// Usage
//   bun run --filter @modern-admin/app-api-prisma db:clean-e2e         # dry run
//   bun run --filter @modern-admin/app-api-prisma db:clean-e2e:apply   # delete

import { prisma } from './db.js'

/** Ids minted by `seed-demo.ts` — never touched. */
const SEED_ID_PREFIX = '00000000-'

/**
 * A `Date.now()` stamp: 13 digits, and (until 2286) starting with 1. Anchored
 * on non-digits so a longer number can't masquerade as one.
 */
const GENERATED_STAMP = /(?<!\d)1\d{12}(?!\d)/

interface Delegate {
  findMany(args?: unknown): Promise<Array<Record<string, unknown>>>
  deleteMany(args?: unknown): Promise<{ count: number }>
  count(args?: unknown): Promise<number>
}

/**
 * Demo tables that carry a human-readable label, parents first.
 *
 * `postTag` / `productTag` are deliberately absent: they hold no label to
 * fingerprint, and the schema cascades them away with their parents. Links
 * an m2m spec attached between two *seed* rows survive — they're reported at
 * the end rather than guessed at.
 */
const LABELLED_TABLES = {
  customer: ['name', 'email'],
  category: ['name'],
  tag: ['name'],
  post: ['title', 'slug'],
  product: ['name', 'sku'],
  comment: ['body'],
  regionalContent: ['name'],
  favorite: ['label'],
} as const satisfies Record<string, readonly string[]>

type LabelledTable = keyof typeof LABELLED_TABLES

/** Admin resource id → the table backing it, for the system-table sweep. */
const RESOURCE_TABLES: Record<string, LabelledTable> = {
  customers: 'customer',
  categories: 'category',
  tags: 'tag',
  posts: 'post',
  products: 'product',
  comments: 'comment',
  regionalContent: 'regionalContent',
  favorites: 'favorite',
}

const delegateFor = (table: string): Delegate =>
  (prisma as unknown as Record<string, Delegate>)[table]!

/** Non-seed rows — the candidate pool before the stamp test. */
const nonSeed = { id: { not: { startsWith: SEED_ID_PREFIX } } } as const

interface Stray {
  id: string
  label: string
}

/** Non-seed rows in `table` whose label looks machine-generated. */
async function findStrays(table: LabelledTable): Promise<Stray[]> {
  const fields = LABELLED_TABLES[table] as readonly string[]
  const rows = await delegateFor(table).findMany({
    where: nonSeed,
    select: Object.fromEntries([['id', true], ...fields.map((f) => [f, true])]),
  })
  const strays: Stray[] = []
  for (const row of rows) {
    const values = fields.map((f) => (typeof row[f] === 'string' ? (row[f] as string) : ''))
    if (!values.some((v) => GENERATED_STAMP.test(v))) continue
    strays.push({ id: String(row.id), label: values.find(Boolean) ?? String(row.id) })
  }
  return strays
}

/**
 * Revision / audit rows pointing at records that no longer exist.
 *
 * The stores are adapter-agnostic, so they hold no foreign key to the demo
 * tables and nothing cascades. They also grow far faster than the tables
 * they describe — every fixture edit appends a revision plus a log entry —
 * so a cleanup that ignored them would leave the bulk of the rows behind.
 *
 * "Dangling" is decided by lookup, not by name: a revision for a record you
 * still have is kept, whoever created it.
 */
async function findDanglingSystemRows(
  removedIds: ReadonlySet<string>,
): Promise<{ history: string[]; log: string[] }> {
  const liveIds = new Map<string, Set<string>>()
  for (const [resourceId, table] of Object.entries(RESOURCE_TABLES)) {
    const rows = await delegateFor(table).findMany({ select: { id: true } })
    const ids = new Set(rows.map((r) => String(r.id)))
    for (const id of removedIds) ids.delete(id)
    liveIds.set(resourceId, ids)
  }

  const isDangling = (resourceId: string, recordId: string | null): boolean => {
    if (!recordId) return false
    const ids = liveIds.get(resourceId)
    // Unknown resource (admins, roles, …) — leave it alone.
    return ids ? !ids.has(recordId) : false
  }

  const [history, log] = await Promise.all([
    prisma.maHistory.findMany({ select: { id: true, resourceId: true, recordId: true } }),
    prisma.maLog.findMany({ select: { id: true, resourceId: true, recordId: true } }),
  ])

  return {
    history: history.filter((r) => isDangling(r.resourceId, r.recordId)).map((r) => r.id),
    log: log.filter((r) => isDangling(r.resourceId, r.recordId)).map((r) => r.id),
  }
}

async function main(): Promise<void> {
  const apply = process.argv.slice(2).includes('--apply')

  const byTable = new Map<LabelledTable, Stray[]>()
  for (const table of Object.keys(LABELLED_TABLES) as LabelledTable[]) {
    byTable.set(table, await findStrays(table))
  }
  const removedIds = new Set([...byTable.values()].flat().map((s) => s.id))
  const dangling = await findDanglingSystemRows(removedIds)

  const demoTotal = removedIds.size
  const systemTotal = dangling.history.length + dangling.log.length

  console.log(`\n${apply ? 'Removing' : 'Would remove'} generated e2e fixtures\n`)
  for (const [table, strays] of byTable) {
    if (strays.length === 0) continue
    const kept = (await delegateFor(table).count()) - strays.length
    console.log(`  ${table.padEnd(16)} ${String(strays.length).padStart(5)}  (keeping ${kept})`)
    for (const { label } of strays.slice(0, 3)) {
      console.log(`  ${' '.repeat(16)}    · ${label}`)
    }
    if (strays.length > 3) {
      console.log(`  ${' '.repeat(16)}    … and ${strays.length - 3} more`)
    }
  }
  if (systemTotal > 0) {
    console.log(`  ${'ma_history'.padEnd(16)} ${String(dangling.history.length).padStart(5)}  (revisions of deleted records)`)
    console.log(`  ${'ma_log'.padEnd(16)} ${String(dangling.log.length).padStart(5)}  (audit entries for deleted records)`)
  }

  if (demoTotal === 0 && systemTotal === 0) {
    console.log('  nothing to clean\n')
  } else if (!apply) {
    console.log(
      `\n  ${demoTotal} demo row(s) + ${systemTotal} system row(s).` +
        '\n  Re-run with `--apply` to delete.\n',
    )
  } else {
    for (const [table, strays] of byTable) {
      if (strays.length === 0) continue
      const { count } = await delegateFor(table).deleteMany({
        where: { id: { in: strays.map((s) => s.id) } },
      })
      console.log(`  removed ${String(count).padStart(5)} from ${table}`)
    }
    if (dangling.history.length > 0) {
      const { count } = await prisma.maHistory.deleteMany({ where: { id: { in: dangling.history } } })
      console.log(`  removed ${String(count).padStart(5)} from ma_history`)
    }
    if (dangling.log.length > 0) {
      const { count } = await prisma.maLog.deleteMany({ where: { id: { in: dangling.log } } })
      console.log(`  removed ${String(count).padStart(5)} from ma_log`)
    }
    console.log(`\n  done — ${demoTotal + systemTotal} row(s) removed\n`)
  }

  // Junction links between two seed rows can't be fingerprinted; surface the
  // count so a real build-up doesn't stay invisible.
  for (const junction of ['postTag', 'productTag'] as const) {
    const orphanLinks = await delegateFor(junction).count({ where: nonSeed })
    if (orphanLinks > 0) {
      console.log(
        `  note: ${orphanLinks} non-seed ${junction} link(s) left in place —` +
          ' unlabelled, so they cannot be told apart from manual ones.',
      )
    }
  }
}

main()
  .catch((err: unknown) => {
    console.error('[clean-e2e] failed:', err)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
