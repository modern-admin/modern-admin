/**
 * Structural Prisma typings used by the system stores.
 *
 * Prisma generates a fully-typed client per project, so we can't import a
 * concrete `PrismaClient` here. Instead, every store consumes a minimal
 * delegate shape — the same handful of methods Prisma always emits for a
 * model. The host's actual generated client matches this surface
 * structurally, no casts required.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface PrismaDelegate<TRow = any> {
  findMany(args?: any): Promise<TRow[]>
  findUnique(args: { where: any }): Promise<TRow | null>
  findFirst(args?: any): Promise<TRow | null>
  create(args: { data: any }): Promise<TRow>
  update(args: { where: any; data: any }): Promise<TRow>
  upsert(args: { where: any; update: any; create: any }): Promise<TRow>
  delete(args: { where: any }): Promise<TRow>
  deleteMany(args?: { where?: any }): Promise<{ count: number }>
  count(args?: any): Promise<number>
}

/**
 * Whatever `prisma` instance the host injects. We index into it by model
 * name (default: `maLog`, `maWebhook`, …); see `setupPrismaSystem`'s
 * `models` option for renames.
 *
 * Uses `{ [K: string]: any }` (not `Record<string, PrismaDelegate>`) so that
 * the generated `PrismaClient` — which carries utility methods like
 * `$connect`, `$disconnect`, `$transaction` that are NOT `PrismaDelegate` —
 * is directly assignable without a cast. TypeScript only waives the
 * "missing index signature" check when the index value type is `any`; any
 * other type (including `unknown`) still rejects `PrismaClient`. The shape
 * of each delegate is validated at runtime in `resolveDelegate()`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PrismaLike = { [K: string]: any }

export const DEFAULT_MODELS = {
  log: 'maLog',
  webhook: 'maWebhook',
  webhookDelivery: 'maWebhookDelivery',
  config: 'maConfig',
  history: 'maHistory',
  aiTask: 'maAiTask',
  aiTaskEvent: 'maAiTaskEvent',
  cache: 'maCache',
} as const

export type ModelKey = keyof typeof DEFAULT_MODELS
export type ModelOverrides = Partial<Record<ModelKey, string>>

export function resolveDelegate(
  prisma: PrismaLike,
  key: ModelKey,
  overrides: ModelOverrides | undefined,
): PrismaDelegate {
  const name = overrides?.[key] ?? DEFAULT_MODELS[key]
  const delegate = prisma[name] as PrismaDelegate | undefined
  if (!delegate || typeof delegate.findMany !== 'function') {
    throw new Error(
      `[modern-admin/system-prisma] missing delegate "prisma.${name}". ` +
      `Make sure the Modern Admin schema fragment is included in your schema.prisma ` +
      `(see @modern-admin/system-prisma/schema), and that the Prisma client has been generated.`,
    )
  }
  return delegate
}
