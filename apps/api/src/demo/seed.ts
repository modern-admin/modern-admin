// Seed data used by the reference admin module. Resources exercise
// every property type the UI knows: scalars, references, references[],
// richtext/markdown, previewMedia, json, etc.
//
// Volumes are intentionally larger than a hand-curated demo so the list
// view can show pagination/sorting/filtering with realistic load:
//   customers:       30   rows  (renamed from "users" — these are app
//                                 end-users, NOT panel admins. Panel
//                                 admins live in `ma_user` via Better Auth
//                                 and are exposed as the `admins` resource.)
//   categories:      12   rows
//   tags:            25   rows
//   posts:           200  rows
//   comments:        1000 rows
//   products:        80   rows
//   regionalContent: 12   rows  (jsonByKeyFeature demo)
//   favorites:       18   rows  (showWhen polymorphic demo)

import { BaseProperty } from '@modern-admin/core'
import type { InMemoryDb, InMemoryRow } from './in-memory-adapter.js'

// ─── Deterministic PRNG so reloads produce the same rows ─────────────────
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

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

// ─── Text generators ─────────────────────────────────────────────────────
const WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing',
  'elit', 'sed', 'eiusmod', 'tempor', 'incididunt', 'labore', 'magna',
  'aliqua', 'kernel', 'thread', 'cache', 'pointer', 'lambda', 'monad',
  'compiler', 'parser', 'lexer', 'token', 'graph', 'queue', 'stack',
  'tree', 'hash', 'index', 'shard', 'replica', 'commit', 'rebase',
]
const word = (): string => pick(WORDS)
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
const sentence = (len = 10): string =>
  cap(Array.from({ length: len }, word).join(' ')) + '.'
const paragraph = (sentences = 4): string =>
  Array.from({ length: sentences }, () => sentence(8 + rand(8))).join(' ')

const richtextBody = (): string => {
  const parts: string[] = []
  parts.push(`<p>${paragraph(2)}</p>`)
  parts.push(`<h2>${cap(sentence(4))}</h2>`)
  parts.push(`<p>${paragraph(3)}</p>`)
  parts.push(
    `<ul>${Array.from({ length: 3 }, () => `<li>${sentence(5)}</li>`).join('')}</ul>`,
  )
  parts.push(`<blockquote><p>${sentence(8)}</p></blockquote>`)
  parts.push(`<p><strong>${sentence(4)}</strong> ${sentence(6)}</p>`)
  return parts.join('')
}

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

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60)

const dayMs = 86_400_000
const baseDate = Date.UTC(2024, 0, 1)
const dateAt = (offsetDays: number): Date => new Date(baseDate + offsetDays * dayMs)

const uuidLike = (n: number): string => {
  const hex = n.toString(16).padStart(12, '0')
  return `00000000-0000-4000-8000-${hex}`
}

// ─── Static dictionaries ─────────────────────────────────────────────────
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

const POST_VERBS = ['Notes on', 'Inside', 'Revisiting', 'A short tour of', 'Lessons from', 'A look at', 'Anatomy of']
const POST_NOUNS = ['compilers', 'kernels', 'concurrency', 'category theory', 'lambda calculus', 'distributed systems', 'storage engines', 'SAT solvers', 'memory models', 'ray tracing']

const PRODUCT_BASES = [
  'Modern Notebook', 'Quantum Mug', 'Compiler Hoodie', 'Deadlock Sticker',
  'Tabs vs Spaces Tee', 'Recursive Plushie', 'Big-O Bottle', 'Lambda Cap',
  'Y-Combinator Pin', 'Halting Hat', 'Monad Tote', 'Functor Notebook',
]
const PRODUCT_CURRENCIES = ['USD', 'EUR', 'RUB'] as const
const PRODUCT_ACCENT_COLORS = ['#111827', '#2563eb', '#7c3aed', '#dc2626', '#059669', '#ea580c'] as const

// ─── Row builders ────────────────────────────────────────────────────────
const CUSTOMERS_COUNT = 30
const customers: InMemoryRow[] = Array.from({ length: CUSTOMERS_COUNT }, (_, i) => {
  const first = FIRST_NAMES[i % FIRST_NAMES.length]!
  const last = LAST_NAMES[(i * 7) % LAST_NAMES.length]!
  const name = `${first} ${last}`
  const handle = `${first}.${last}${i + 1}`.toLowerCase().replace(/[^a-z0-9.]+/g, '')
  return {
    id: String(i + 1),
    email: `${handle}@example.com`,
    name,
    phone: `+1-555-${String(100 + i).padStart(3, '0')}-${String(1000 + ((i * 37) % 9000)).padStart(4, '0')}`,
    tier: pick(TIERS),
    // Pre-hashed placeholder so existing seed customers don't break the
    // login flow; new/edit go through `passwordsFeature` to be re-hashed.
    password: '$argon2id$v=19$m=65536,t=2,p=1$placeholder',
    avatarUrl: `https://i.pravatar.cc/240?u=customer-${i + 1}`,
    websiteUrl: `https://example.com/u/${slugify(name)}`,
    bio: markdownBody(),
    score: Math.round(rng() * 10000) / 100,
    birthday: dateAt(-(365 * (20 + rand(40))) + rand(365)),
    lastLoginAt: dateAt(rand(365)),
    createdAt: dateAt(-365 + rand(365)),
  }
})

const categories: InMemoryRow[] = CATEGORY_NAMES.map((name, i) => ({
  id: String(i + 1),
  name,
  slug: slugify(name),
  description: paragraph(2),
  position: i + 1,
  iconUrl: `https://placehold.co/96x96/png?text=${encodeURIComponent(name[0]!)}`,
}))

const tags: InMemoryRow[] = TAG_NAMES.map((name, i) => ({
  id: String(i + 1),
  name,
  slug: slugify(name),
  color: pick(TAG_COLORS),
  usageCount: rand(500),
}))
const tagIdPool = tags.map((t) => String(t.id))

const POSTS_COUNT = 200
// Per-post junction rows: m2m via real `postTags` table with an extra
// `addedAt` column to demonstrate junction-row metadata.
const postTags: InMemoryRow[] = []
let postTagAutoId = 1
const posts: InMemoryRow[] = Array.from({ length: POSTS_COUNT }, (_, i) => {
  const title = `${pick(POST_VERBS)} ${pick(POST_NOUNS)} #${i + 1}`
  const postId = String(i + 1)
  for (const tagId of pickN(tagIdPool, 1 + rand(4))) {
    postTags.push({
      id: String(postTagAutoId++),
      postId,
      tagId,
      addedAt: dateAt(rand(365)),
    })
  }
  return {
    id: postId,
    title,
    slug: slugify(title),
    excerpt: sentence(15),
    body: richtextBody(),
    authorId: String(1 + rand(CUSTOMERS_COUNT)),
    categoryId: String(1 + rand(CATEGORY_NAMES.length)),
    coverUrl: `https://picsum.photos/seed/post-${i + 1}/640/360`,
    viewsCount: rand(50_000),
    rating: Math.round(rng() * 500) / 100,
    metadata: {
      featured: rng() > 0.7,
      locale: pick(['en', 'ru', 'de']),
      readingMinutes: 1 + rand(20),
    },
    published: rng() > 0.2,
    publishedAt: dateAt(rand(365)),
  }
})

const COMMENTS_COUNT = 1000
const comments: InMemoryRow[] = Array.from({ length: COMMENTS_COUNT }, (_, i) => ({
  id: String(i + 1),
  postId: String(1 + rand(POSTS_COUNT)),
  authorId: String(1 + rand(CUSTOMERS_COUNT)),
  body: paragraph(1 + rand(2)),
  rating: Math.round(rng() * 500) / 100,
  createdAt: dateAt(rand(365)),
}))

const PRODUCTS_COUNT = 80
// Per-product junction rows: m2m via real `productTags` table with an extra
// `position` column (display ordering inside the product) to demonstrate
// junction-row metadata.
const productTags: InMemoryRow[] = []
let productTagAutoId = 1
const products: InMemoryRow[] = Array.from({ length: PRODUCTS_COUNT }, (_, i) => {
  const name = `${pick(PRODUCT_BASES)} #${i + 1}`
  const productId = String(i + 1)
  const chosen = pickN(tagIdPool, 1 + rand(3))
  chosen.forEach((tagId, idx) => {
    productTags.push({
      id: String(productTagAutoId++),
      productId,
      tagId,
      position: idx,
    })
  })
  return {
    id: productId,
    sku: uuidLike(i + 1),
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
    thumbnailUrl: `https://picsum.photos/seed/product-${i + 1}/400/400`,
    galleryUrl: `https://picsum.photos/seed/product-gallery-${i + 1}/1200/800`,
    videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
    specs: {
      weight: rand(2000),
      color: pick(['black', 'white', 'red', 'blue']),
      dimensions: { w: rand(300), h: rand(300), d: rand(100) },
    },
    categoryId: String(1 + rand(CATEGORY_NAMES.length)),
  }
})

// ─── admins + roles (Access Control demo) ───────────────────────────────
// In `apps/api-prisma` these resources are backed by Better Auth's
// `ma_user` and the new `ma_role` tables. Here we keep a standalone
// in-memory copy so the UI can showcase the same screens without a
// writable persistence store.
const ROLES_BUILTIN = [
  {
    id: 'admin',
    description: 'Full access to every resource and action.',
    permissions: { '*': ['*'] },
    isBuiltin: true,
  },
  {
    id: 'viewer',
    description: 'Read-only access across the panel.',
    permissions: { '*': ['list', 'show', 'search'] },
    isBuiltin: true,
  },
] as const

const ROLES_CUSTOM = [
  {
    id: 'editor',
    description: 'Can manage content but not access controls.',
    permissions: {
      posts: ['*'],
      comments: ['*'],
      categories: ['list', 'show', 'edit'],
      tags: ['*'],
      customers: ['list', 'show'],
    },
    isBuiltin: false,
  },
] as const

const roles: InMemoryRow[] = [...ROLES_BUILTIN, ...ROLES_CUSTOM].map((r) => ({
  ...r,
  permissions: r.permissions as Record<string, readonly string[]>,
  createdAt: dateAt(-365),
  updatedAt: dateAt(-30),
}))

const ADMIN_NAMES = [
  ['Root', 'Admin'],
  ['Mira', 'Stone'],
  ['Iván', 'Pérez'],
  ['Yuki', 'Tanaka'],
  ['Olga', 'Volkov'],
] as const
const admins: InMemoryRow[] = ADMIN_NAMES.map(([first, last], i) => {
  const name = `${first} ${last}`
  const handle = `${first}.${last}`.toLowerCase().replace(/[^a-z0-9.]+/g, '')
  return {
    id: String(i + 1),
    email: `${handle}@modern-admin.local`,
    name,
    role: i === 0 ? 'admin' : pick(['admin', 'editor', 'viewer'] as const),
    image: `https://i.pravatar.cc/240?u=admin-${i + 1}`,
    banned: false,
    banReason: null,
    banExpires: null,
    emailVerified: true,
    createdAt: dateAt(-200 + rand(150)),
    updatedAt: dateAt(rand(60)),
  }
})

// ─── regionalContent (jsonByKeyFeature demo) ────────────────────────────
// One row per landing page; each row carries per-region copy (`titles`)
// and per-region cover images (`previews`) inside JSON columns. The admin
// UI fans these out via `jsonByKeyFeature` so editors pick a region from
// a dropdown and edit the corresponding fields without touching JSON.
const REGIONS = ['eu', 'us', 'asia'] as const
const REGIONAL_NAMES = [
  'Holiday Sale', 'Spring Launch', 'Back to School', 'Black Friday',
  'New Year', 'Summer Tour', 'Q4 Roadshow', 'Press Day',
  'Beta Invite', 'Early Access', 'Anniversary', 'Family Pack',
]
const regionalContent: InMemoryRow[] = REGIONAL_NAMES.map((name, i) => {
  const titles: Record<string, string> = {}
  const previews: Record<string, string> = {}
  for (const region of REGIONS) {
    titles[region] = `${name} (${region.toUpperCase()})`
    // External URL placeholders so the UI shows something before any real
    // upload happens. Once the user uploads through `jsonByKeyFeature`,
    // the storage backend replaces these with provider keys.
    previews[region] = `https://picsum.photos/seed/regional-${i + 1}-${region}/640/360`
  }
  return {
    id: String(i + 1),
    name,
    region: pick(REGIONS),
    titles,
    previews,
    publishedAt: dateAt(rand(180)),
  }
})

// ─── favorites (showWhen polymorphic demo) ───────────────────────────────
// Single row stores a "favorite" pointing at one of three different
// resources, picked by the `kind` enum. Only the matching reference field
// is shown on the form thanks to property-level `showWhen` rules.
const FAV_KINDS = ['post', 'product', 'category'] as const
const FAVORITES_COUNT = 18
const favorites: InMemoryRow[] = Array.from({ length: FAVORITES_COUNT }, (_, i) => {
  const kind = pick(FAV_KINDS)
  return {
    id: String(i + 1),
    label: `Favorite #${i + 1}`,
    kind,
    postId: kind === 'post' ? String(1 + rand(POSTS_COUNT)) : null,
    productId: kind === 'product' ? String(1 + rand(PRODUCTS_COUNT)) : null,
    categoryId: kind === 'category' ? String(1 + rand(CATEGORY_NAMES.length)) : null,
    createdAt: dateAt(rand(365)),
  }
})

// ─── Seed entry point ────────────────────────────────────────────────────
export const seed = (): InMemoryDb => ({
  __inMemory: true,
  tables: [
    {
      name: 'admins',
      properties: [
        new BaseProperty({ path: 'id', isId: true }),
        new BaseProperty({ path: 'email', type: 'string', isRequired: true }),
        new BaseProperty({ path: 'name', type: 'string', isRequired: true }),
        new BaseProperty({ path: 'role', type: 'string' }),
        new BaseProperty({ path: 'image', type: 'previewMedia' }),
        new BaseProperty({ path: 'banned', type: 'boolean' }),
        new BaseProperty({ path: 'banReason', type: 'string' }),
        new BaseProperty({ path: 'banExpires', type: 'datetime' }),
        new BaseProperty({ path: 'emailVerified', type: 'boolean' }),
        new BaseProperty({ path: 'createdAt', type: 'datetime' }),
        new BaseProperty({ path: 'updatedAt', type: 'datetime' }),
      ],
      rows: admins,
    },
    {
      name: 'roles',
      properties: [
        new BaseProperty({ path: 'id', isId: true }),
        new BaseProperty({ path: 'name', type: 'string', isRequired: true }),
        new BaseProperty({ path: 'description', type: 'textarea' }),
        new BaseProperty({ path: 'permissions', type: 'json' }),
        new BaseProperty({ path: 'isBuiltin', type: 'boolean' }),
        new BaseProperty({ path: 'createdAt', type: 'datetime' }),
        new BaseProperty({ path: 'updatedAt', type: 'datetime' }),
      ],
      rows: roles,
    },
    {
      name: 'customers',
      properties: [
        new BaseProperty({ path: 'id', isId: true }),
        new BaseProperty({ path: 'email', type: 'string', isRequired: true }),
        new BaseProperty({ path: 'name', type: 'string', isRequired: true }),
        new BaseProperty({ path: 'phone', type: 'phone' }),
        new BaseProperty({
          path: 'tier',
          type: 'string',
          availableValues: [...TIERS],
        }),
        new BaseProperty({ path: 'password', type: 'password' }),
        new BaseProperty({ path: 'avatarUrl', type: 'previewMedia' }),
        new BaseProperty({ path: 'websiteUrl', type: 'string' }),
        new BaseProperty({ path: 'bio', type: 'markdown' }),
        new BaseProperty({ path: 'score', type: 'float' }),
        new BaseProperty({ path: 'birthday', type: 'date' }),
        new BaseProperty({ path: 'lastLoginAt', type: 'datetime' }),
        new BaseProperty({ path: 'createdAt', type: 'datetime' }),
      ],
      rows: customers,
    },
    {
      name: 'categories',
      properties: [
        new BaseProperty({ path: 'id', isId: true }),
        new BaseProperty({ path: 'name', type: 'string', isRequired: true }),
        new BaseProperty({ path: 'slug', type: 'string' }),
        new BaseProperty({ path: 'description', type: 'textarea' }),
        new BaseProperty({ path: 'position', type: 'number' }),
        new BaseProperty({ path: 'iconUrl', type: 'previewMedia' }),
      ],
      rows: categories,
    },
    {
      name: 'tags',
      properties: [
        new BaseProperty({ path: 'id', isId: true }),
        new BaseProperty({ path: 'name', type: 'string', isRequired: true }),
        new BaseProperty({ path: 'slug', type: 'string' }),
        new BaseProperty({
          path: 'color',
          type: 'string',
          availableValues: [...TAG_COLORS],
        }),
        new BaseProperty({ path: 'usageCount', type: 'number' }),
      ],
      rows: tags,
    },
    {
      name: 'posts',
      properties: [
        new BaseProperty({ path: 'id', isId: true }),
        new BaseProperty({ path: 'title', type: 'string', isRequired: true }),
        new BaseProperty({ path: 'slug', type: 'string' }),
        new BaseProperty({ path: 'excerpt', type: 'textarea' }),
        new BaseProperty({ path: 'body', type: 'richtext' }),
        new BaseProperty({
          path: 'authorId',
          type: 'reference',
          reference: 'customers',
          isRequired: true,
        }),
        new BaseProperty({
          path: 'categoryId',
          type: 'reference',
          reference: 'categories',
        }),
        new BaseProperty({ path: 'coverUrl', type: 'previewMedia' }),
        new BaseProperty({ path: 'viewsCount', type: 'number' }),
        new BaseProperty({ path: 'rating', type: 'float' }),
        new BaseProperty({ path: 'metadata', type: 'json' }),
        new BaseProperty({ path: 'published', type: 'boolean' }),
        new BaseProperty({ path: 'publishedAt', type: 'datetime' }),
      ],
      rows: posts,
    },
    {
      name: 'comments',
      properties: [
        new BaseProperty({ path: 'id', isId: true }),
        new BaseProperty({
          path: 'postId',
          type: 'reference',
          reference: 'posts',
          isRequired: true,
        }),
        new BaseProperty({
          path: 'authorId',
          type: 'reference',
          reference: 'customers',
          isRequired: true,
        }),
        new BaseProperty({ path: 'body', type: 'textarea', isRequired: true }),
        new BaseProperty({ path: 'rating', type: 'float' }),
        new BaseProperty({ path: 'createdAt', type: 'datetime' }),
      ],
      rows: comments,
    },
    {
      name: 'products',
      properties: [
        new BaseProperty({ path: 'id', isId: true }),
        new BaseProperty({ path: 'sku', type: 'uuid' }),
        new BaseProperty({ path: 'name', type: 'string', isRequired: true }),
        new BaseProperty({ path: 'slug', type: 'string' }),
        new BaseProperty({ path: 'summary', type: 'textarea' }),
        new BaseProperty({ path: 'description', type: 'markdown' }),
        new BaseProperty({ path: 'price', type: 'money' }),
        new BaseProperty({
          path: 'currencyCode',
          type: 'string',
          availableValues: [...PRODUCT_CURRENCIES],
        }),
        new BaseProperty({ path: 'accentColor', type: 'color' }),
        new BaseProperty({ path: 'inStock', type: 'boolean' }),
        new BaseProperty({ path: 'quantity', type: 'number' }),
        new BaseProperty({ path: 'rating', type: 'float' }),
        new BaseProperty({ path: 'launchedAt', type: 'date' }),
        new BaseProperty({ path: 'thumbnail', type: 'string' }),
        new BaseProperty({ path: 'gallery', type: 'string', isArray: true }),
        new BaseProperty({ path: 'thumbnailUrl', type: 'previewMedia' }),
        new BaseProperty({ path: 'galleryUrl', type: 'previewMedia' }),
        new BaseProperty({ path: 'videoUrl', type: 'previewMedia' }),
        new BaseProperty({ path: 'specs', type: 'json' }),
        new BaseProperty({
          path: 'categoryId',
          type: 'reference',
          reference: 'categories',
        }),
      ],
      rows: products,
    },
    {
      name: 'postTags',
      properties: [
        new BaseProperty({ path: 'id', isId: true }),
        new BaseProperty({
          path: 'postId',
          type: 'reference',
          reference: 'posts',
          isRequired: true,
        }),
        new BaseProperty({
          path: 'tagId',
          type: 'reference',
          reference: 'tags',
          isRequired: true,
        }),
        new BaseProperty({ path: 'addedAt', type: 'datetime' }),
      ],
      rows: postTags,
    },
    {
      name: 'productTags',
      properties: [
        new BaseProperty({ path: 'id', isId: true }),
        new BaseProperty({
          path: 'productId',
          type: 'reference',
          reference: 'products',
          isRequired: true,
        }),
        new BaseProperty({
          path: 'tagId',
          type: 'reference',
          reference: 'tags',
          isRequired: true,
        }),
        new BaseProperty({ path: 'position', type: 'number' }),
      ],
      rows: productTags,
    },
    {
      name: 'regionalContent',
      properties: [
        new BaseProperty({ path: 'id', isId: true }),
        new BaseProperty({ path: 'name', type: 'string', isRequired: true }),
        new BaseProperty({
          path: 'region',
          type: 'string',
          availableValues: [...REGIONS],
        }),
        new BaseProperty({ path: 'titles', type: 'json' }),
        new BaseProperty({ path: 'previews', type: 'json' }),
        new BaseProperty({ path: 'publishedAt', type: 'datetime' }),
      ],
      rows: regionalContent,
    },
    {
      name: 'favorites',
      properties: [
        new BaseProperty({ path: 'id', isId: true }),
        new BaseProperty({ path: 'label', type: 'string', isRequired: true }),
        new BaseProperty({
          path: 'kind',
          type: 'string',
          availableValues: [...FAV_KINDS],
          isRequired: true,
        }),
        new BaseProperty({
          path: 'postId',
          type: 'reference',
          reference: 'posts',
        }),
        new BaseProperty({
          path: 'productId',
          type: 'reference',
          reference: 'products',
        }),
        new BaseProperty({
          path: 'categoryId',
          type: 'reference',
          reference: 'categories',
        }),
        new BaseProperty({ path: 'createdAt', type: 'datetime' }),
      ],
      rows: favorites,
    },
  ],
})
