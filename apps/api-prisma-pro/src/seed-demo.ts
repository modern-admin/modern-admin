// Idempotent demo seed for the Prisma host of Modern Admin.
//
// Mirrors the row shapes produced by `apps/api/src/demo/seed.ts` (the
// InMemory reference) but writes to the demo Prisma models declared in
// `prisma/schema.prisma` (Customer, Post, …). Activated by `SEED_DEMO=1`
// so production migrations never accidentally inject demo content.
//
// Idempotency strategy
// --------------------
// • Deterministic UUIDs: ids are `00000000-000<entity>-4000-8000-<seq>`
//   — the same shape as the InMemory `uuidLike` precedent. Each entity
//   has its own digit so cross-table primary-key collisions are impossible.
// • Every write goes through `upsert` keyed on `id` (or on the junction's
//   composite-unique `(postId, tagId)` / `(productId, tagId)`), so re-running
//   the seed updates rows in place rather than failing.
// • A single PRNG seed (`mulberry32`) keeps random fields stable across
//   re-runs.
//
// Volumes match the InMemory seed: 30 customers, 12 categories, 25 tags,
// 200 posts (≈1–4 tags each), 1000 comments, 80 products (≈1–3 tags each),
// 12 regional pages, 18 favorites.

import { prisma } from './db.js'
import { type Prisma } from './generated/prisma/client'

// ─── Env gate ────────────────────────────────────────────────────────────
const shouldSeedDemo = (): boolean => {
  const value = process.env.SEED_DEMO
  return value === '1' || value === 'true'
}

// ─── Deterministic PRNG (matches apps/api/src/demo/seed.ts) ──────────────
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── ID helpers ──────────────────────────────────────────────────────────
// Distinct prefix per entity so ids are globally unique without coordination.
const ENTITY_PREFIX = {
  customer: '0001',
  category: '0002',
  tag: '0003',
  post: '0004',
  comment: '0005',
  product: '0006',
  regional: '0007',
  favorite: '0008',
  postTag: '0009',
  productTag: '000a',
} as const

const idFor = (entity: keyof typeof ENTITY_PREFIX, n: number): string => {
  const prefix = ENTITY_PREFIX[entity]
  const hex = n.toString(16).padStart(12, '0')
  return `00000000-${prefix}-4000-8000-${hex}`
}

// ─── Static dictionaries (mirror InMemory seed) ──────────────────────────
const FIRST_NAMES = [
  'Ada', 'Alan', 'Grace', 'Linus', 'Margaret', 'Donald', 'Edsger', 'Barbara',
  'Niklaus', 'Ken', 'Brian', 'Tony', 'Frances', 'Yukihiro', 'Anders', 'James',
  'Bjarne', 'Guido', 'Larry', 'Rich', 'Dennis', 'Bill', 'Steve', 'Jeff',
  'John', 'Lara', 'Sara', 'Maya', 'Yuki', 'Olga',
]
const LAST_NAMES = [
  'Lovelace', 'Turing', 'Hopper', 'Torvalds', 'Hamilton', 'Knuth', 'Dijkstra',
  'Liskov', 'Wirth', 'Thompson', 'Kernighan', 'Hoare', 'Allen', 'Matsumoto',
  'Hejlsberg', 'Gosling', 'Stroustrup', 'van Rossum', 'Wall', 'Hickey',
]
const TIERS = ['free', 'pro', 'enterprise'] as const
const TAG_COLORS = ['gray', 'blue', 'green', 'amber', 'red', 'violet'] as const
const CATEGORY_NAMES = [
  'Engineering', 'Mathematics', 'History', 'Design', 'DevOps', 'Security',
  'Data', 'Mobile', 'Web', 'Embedded', 'AI/ML', 'Cloud',
]
const TAG_NAMES = [
  'open-source', 'kernel', 'turing', 'logic', 'apollo', 'compilers', 'rust',
  'typescript', 'react', 'graphql', 'postgres', 'redis', 'docker', 'k8s',
  'wasm', 'edge', 'algorithms', 'hardware', 'history', 'theory', 'practice',
  'tutorial', 'rfc', 'paper', 'talk',
]
const POST_VERBS = [
  'Notes on', 'Inside', 'Revisiting', 'A short tour of', 'Lessons from',
  'A look at', 'Anatomy of',
]
const POST_NOUNS = [
  'compilers', 'kernels', 'concurrency', 'category theory', 'lambda calculus',
  'distributed systems', 'storage engines', 'SAT solvers', 'memory models',
  'ray tracing',
]
const PRODUCT_BASES = [
  'Modern Notebook', 'Quantum Mug', 'Compiler Hoodie', 'Deadlock Sticker',
  'Tabs vs Spaces Tee', 'Recursive Plushie', 'Big-O Bottle', 'Lambda Cap',
  'Y-Combinator Pin', 'Halting Hat', 'Monad Tote', 'Functor Notebook',
]
const PRODUCT_CURRENCIES = ['USD', 'EUR', 'RUB'] as const
const PRODUCT_ACCENT_COLORS = [
  '#111827', '#2563eb', '#7c3aed', '#dc2626', '#059669', '#ea580c',
] as const
const REGIONS = ['eu', 'us', 'asia'] as const
const REGIONAL_NAMES = [
  'Holiday Sale', 'Spring Launch', 'Back to School', 'Black Friday',
  'New Year', 'Summer Tour', 'Q4 Roadshow', 'Press Day',
  'Beta Invite', 'Early Access', 'Anniversary', 'Family Pack',
]
const FAV_KINDS = ['post', 'product', 'category'] as const

// ─── Volumes ─────────────────────────────────────────────────────────────
const CUSTOMERS_COUNT = 30
const POSTS_COUNT = 200
const COMMENTS_COUNT = 1000
const PRODUCTS_COUNT = 80
const FAVORITES_COUNT = 18

// ─── Text helpers ────────────────────────────────────────────────────────
const WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing',
  'elit', 'sed', 'eiusmod', 'tempor', 'incididunt', 'labore', 'magna',
  'aliqua', 'kernel', 'thread', 'cache', 'pointer', 'lambda', 'monad',
  'compiler', 'parser', 'lexer', 'token', 'graph', 'queue', 'stack',
  'tree', 'hash', 'index', 'shard', 'replica', 'commit', 'rebase',
]

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60)

const dayMs = 86_400_000
const baseDate = Date.UTC(2024, 0, 1)
const dateAt = (offsetDays: number): Date => new Date(baseDate + offsetDays * dayMs)

// ─── Main seeder ─────────────────────────────────────────────────────────
async function seedDemo(): Promise<void> {
  const rng = mulberry32(20240508)
  const rand = (max: number): number => Math.floor(rng() * max)
  const pick = <T>(arr: readonly T[]): T => arr[rand(arr.length)]!
  const pickN = <T>(arr: readonly T[], n: number): T[] => {
    const copy = [...arr]
    const out: T[] = []
    while (out.length < n && copy.length > 0) {
      const i = rand(copy.length)
      out.push(copy.splice(i, 1)[0]!)
    }
    return out
  }
  const word = (): string => pick(WORDS)
  const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
  const sentence = (len = 10): string =>
    cap(Array.from({ length: len }, word).join(' ')) + '.'
  const paragraph = (sentences = 4): string =>
    Array.from({ length: sentences }, () => sentence(8 + rand(8))).join(' ')

  const richtextBody = (): string =>
    [
      `<p>${paragraph(2)}</p>`,
      `<h2>${cap(sentence(4))}</h2>`,
      `<p>${paragraph(3)}</p>`,
      `<ul>${Array.from({ length: 3 }, () => `<li>${sentence(5)}</li>`).join('')}</ul>`,
      `<blockquote><p>${sentence(8)}</p></blockquote>`,
      `<p><strong>${sentence(4)}</strong> ${sentence(6)}</p>`,
    ].join('')

  const markdownBody = (): string =>
    [
      `# ${sentence(4)}`,
      '',
      paragraph(2),
      '',
      `## ${sentence(3)}`,
      '',
      `- ${sentence(5)}`,
      `- ${sentence(5)}`,
      `- ${sentence(5)}`,
      '',
      `> ${sentence(6)}`,
      '',
      '```ts',
      `const x: number = ${rand(100)}`,
      '```',
    ].join('\n')

  // ─── Built-in roles (ma_role) ───────────────────────────────────────
  // Two seeded roles cover the canonical extremes; new roles are created
  // through the panel UI. The role `id` doubles as the user-visible name
  // and is the string stored in `ma_user.role` by Better Auth's admin
  // plugin — that's how the reference renderer rounds-trips it back to
  // a row in this table.
  const BUILTIN_ROLES = [
    {
      id: 'admin',
      description: 'Full access to every resource and action.',
      permissions: { '*': ['*'] } as Prisma.InputJsonValue,
    },
    {
      id: 'viewer',
      description: 'Read-only access across the panel.',
      permissions: { '*': ['list', 'show', 'search'] } as Prisma.InputJsonValue,
    },
  ]
  for (const role of BUILTIN_ROLES) {
    const { id, ...rest } = role
    await prisma.maRole.upsert({
      where: { id },
      create: { id, ...rest, isBuiltin: true },
      // Re-running the seed keeps built-in flag and canonical permissions
      // in lockstep with the source — operators who need looser/tighter
      // defaults should fork these values rather than edit live rows.
      update: { ...rest, isBuiltin: true },
    })
  }

  // ─── Customers ──────────────────────────────────────────────────────
  const customerIds: string[] = []
  for (let i = 0; i < CUSTOMERS_COUNT; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length]!
    const last = LAST_NAMES[(i * 7) % LAST_NAMES.length]!
    const name = `${first} ${last}`
    const handle = `${first}.${last}${i + 1}`.toLowerCase().replace(/[^a-z0-9.]+/g, '')
    const id = idFor('customer', i + 1)
    customerIds.push(id)
    const data = {
      email: `${handle}@example.com`,
      name,
      phone: `+1-555-${String(100 + i).padStart(3, '0')}-${String(1000 + ((i * 37) % 9000)).padStart(4, '0')}`,
      tier: pick(TIERS),
      password: '$argon2id$v=19$m=65536,t=2,p=1$placeholder',
      avatarUrl: `https://i.pravatar.cc/240?u=customer-${i + 1}`,
      websiteUrl: `https://example.com/u/${slugify(name)}`,
      bio: markdownBody(),
      score: Math.round(rng() * 10000) / 100,
      birthday: dateAt(-(365 * (20 + rand(40))) + rand(365)),
      lastLoginAt: dateAt(rand(365)),
      createdAt: dateAt(-365 + rand(365)),
    }
    await prisma.customer.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    })
  }

  // ─── Categories ─────────────────────────────────────────────────────
  const categoryIds: string[] = []
  for (let i = 0; i < CATEGORY_NAMES.length; i++) {
    const name = CATEGORY_NAMES[i]!
    const id = idFor('category', i + 1)
    categoryIds.push(id)
    const data = {
      name,
      slug: slugify(name),
      description: paragraph(2),
      position: i + 1,
      iconUrl: `https://placehold.co/96x96/png?text=${encodeURIComponent(name[0]!)}`,
    }
    await prisma.category.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    })
  }

  // ─── Tags ───────────────────────────────────────────────────────────
  const tagIds: string[] = []
  for (let i = 0; i < TAG_NAMES.length; i++) {
    const name = TAG_NAMES[i]!
    const id = idFor('tag', i + 1)
    tagIds.push(id)
    const data = {
      name,
      slug: slugify(name),
      color: pick(TAG_COLORS),
      usageCount: rand(500),
    }
    await prisma.tag.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    })
  }

  // ─── Posts (+ postTags junctions) ───────────────────────────────────
  let postTagAutoId = 1
  for (let i = 0; i < POSTS_COUNT; i++) {
    const title = `${pick(POST_VERBS)} ${pick(POST_NOUNS)} #${i + 1}`
    const postId = idFor('post', i + 1)
    const data = {
      title,
      slug: slugify(title),
      excerpt: sentence(15),
      body: richtextBody(),
      authorId: customerIds[rand(CUSTOMERS_COUNT)]!,
      categoryId: categoryIds[rand(CATEGORY_NAMES.length)]!,
      coverUrl: `https://picsum.photos/seed/post-${i + 1}/640/360`,
      viewsCount: rand(50_000),
      rating: Math.round(rng() * 500) / 100,
      metadata: {
        featured: rng() > 0.7,
        locale: pick(['en', 'ru', 'de']),
        readingMinutes: 1 + rand(20),
      } as Prisma.InputJsonValue,
      published: rng() > 0.2,
      publishedAt: dateAt(rand(365)),
    }
    await prisma.post.upsert({
      where: { id: postId },
      create: { id: postId, ...data },
      update: data,
    })

    const chosenTagIdxs = pickN(
      tagIds.map((_, idx) => idx),
      1 + rand(4),
    )
    for (const tagIdx of chosenTagIdxs) {
      const tagId = tagIds[tagIdx]!
      const linkId = idFor('postTag', postTagAutoId++)
      const linkData = { postId, tagId, addedAt: dateAt(rand(365)) }
      await prisma.postTag.upsert({
        where: { postId_tagId: { postId, tagId } },
        create: { id: linkId, ...linkData },
        update: linkData,
      })
    }
  }

  // ─── Comments ───────────────────────────────────────────────────────
  for (let i = 0; i < COMMENTS_COUNT; i++) {
    const id = idFor('comment', i + 1)
    const postId = idFor('post', 1 + rand(POSTS_COUNT))
    const authorId = customerIds[rand(CUSTOMERS_COUNT)]!
    const data = {
      postId,
      authorId,
      body: paragraph(1 + rand(2)),
      rating: Math.round(rng() * 500) / 100,
      createdAt: dateAt(rand(365)),
    }
    await prisma.comment.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    })
  }

  // ─── Products (+ productTags junctions) ─────────────────────────────
  let productTagAutoId = 1
  for (let i = 0; i < PRODUCTS_COUNT; i++) {
    const name = `${pick(PRODUCT_BASES)} #${i + 1}`
    const productId = idFor('product', i + 1)
    const data = {
      sku: idFor('product', i + 1),
      name,
      slug: slugify(name),
      summary: sentence(15),
      description: markdownBody(),
      price: Math.round(rng() * 50_000) / 100,
      currencyCode: pick(PRODUCT_CURRENCIES),
      accentColor: pick(PRODUCT_ACCENT_COLORS),
      inStock: rng() > 0.25,
      quantity: rand(100),
      rating: Math.round(rng() * 500) / 100,
      launchedAt: dateAt(-365 + rand(730)),
      // Plain URLs as upload-feature storage keys — the host's chosen
      // upload provider will serve them via its `urlTemplate`.
      thumbnail: `https://picsum.photos/seed/product-${i + 1}/400/400`,
      gallery: [`https://picsum.photos/seed/product-gallery-${i + 1}/1200/800`],
      categoryId: categoryIds[rand(CATEGORY_NAMES.length)]!,
    }
    await prisma.product.upsert({
      where: { id: productId },
      create: { id: productId, ...data },
      update: data,
    })

    const chosenTagIdxs = pickN(
      tagIds.map((_, idx) => idx),
      1 + rand(3),
    )
    for (let position = 0; position < chosenTagIdxs.length; position++) {
      const tagId = tagIds[chosenTagIdxs[position]!]!
      const linkId = idFor('productTag', productTagAutoId++)
      const linkData = { productId, tagId, position }
      await prisma.productTag.upsert({
        where: { productId_tagId: { productId, tagId } },
        create: { id: linkId, ...linkData },
        update: linkData,
      })
    }
  }

  // ─── Regional content (jsonByKeyFeature demo) ───────────────────────
  for (let i = 0; i < REGIONAL_NAMES.length; i++) {
    const name = REGIONAL_NAMES[i]!
    const id = idFor('regional', i + 1)
    const titles: Record<string, string> = {}
    const previews: Record<string, string> = {}
    for (const region of REGIONS) {
      titles[region] = `${name} (${region.toUpperCase()})`
      previews[region] = `https://picsum.photos/seed/regional-${i + 1}-${region}/640/360`
    }
    const data = {
      name,
      region: pick(REGIONS),
      titles: titles as Prisma.InputJsonValue,
      previews: previews as Prisma.InputJsonValue,
      publishedAt: dateAt(rand(180)),
    }
    await prisma.regionalContent.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    })
  }

  // ─── Favorites (showWhen polymorphic demo) ──────────────────────────
  for (let i = 0; i < FAVORITES_COUNT; i++) {
    const kind = pick(FAV_KINDS)
    const id = idFor('favorite', i + 1)
    const data = {
      label: `Favorite #${i + 1}`,
      kind,
      postId: kind === 'post' ? idFor('post', 1 + rand(POSTS_COUNT)) : null,
      productId: kind === 'product' ? idFor('product', 1 + rand(PRODUCTS_COUNT)) : null,
      categoryId:
        kind === 'category' ? categoryIds[rand(CATEGORY_NAMES.length)]! : null,
      createdAt: dateAt(rand(365)),
    }
    await prisma.favorite.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    })
  }
}

export async function seedDemoIfEnabled(): Promise<void> {
  if (!shouldSeedDemo()) return

  try {
    await seedDemo()
    console.log(
      '[modern-admin/api-prisma] seeded demo data: ' +
      `${CUSTOMERS_COUNT} customers, ${CATEGORY_NAMES.length} categories, ` +
      `${TAG_NAMES.length} tags, ${POSTS_COUNT} posts, ` +
      `${COMMENTS_COUNT} comments, ${PRODUCTS_COUNT} products, ` +
      `${REGIONAL_NAMES.length} regional, ${FAVORITES_COUNT} favorites`,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[modern-admin/api-prisma] failed to seed demo data:', message)
  }
}
