// @modern-admin/auth-better-auth — IAuthProvider implementation backed by
// Better Auth. We treat the Better Auth instance as opaque (`auth.api.*`) so
// upgrades within Better Auth don't ripple through this adapter's surface.

import {
  ConsoleLogger,
  type CurrentAdmin,
  type IAuthProvider,
  type ILogger,
  type LoginCredentials,
} from '@modern-admin/core'

export { accountIdentityPlugin } from './account-identity-plugin.js'

export {
  BUILTIN_AUTHORITATIVE_ACCOUNT_ISSUERS,
  BUILTIN_ISSUERLESS_OAUTH_PROVIDERS,
  CREDENTIAL_ACCOUNT_IDENTITY,
  isCredentialAccountIdentity,
  planAccountIdentityMigration,
  resolveAccountIssuer,
  type AccountIdentityInput,
  type AccountIssuerPolicy,
  type PlannedAccountIdentity,
} from './account-identities.js'

/** Wire shape of an apikey row returned by better-auth's api-key plugin. */
export interface ApiKeyRow {
  id: string
  name: string | null
  start: string | null
  prefix: string | null
  enabled: boolean
  permissions?: Record<string, string[]> | null
  expiresAt: Date | string | null
  lastRequest: Date | string | null
  createdAt: Date | string
  updatedAt: Date | string
}

/** Plaintext key returned only by `createApiKey`. */
export interface ApiKeyCreated extends ApiKeyRow {
  key: string
}

/**
 * Subset of better-auth's api-key plugin endpoints we expose to transports
 * for the admin Settings UI. Methods mirror the wire calls 1:1.
 */
export interface ApiKeyAdminApi {
  createApiKey(args: {
    body: {
      name?: string
      expiresIn?: number | null
      permissions?: Record<string, string[]>
      userId?: string
    }
    headers?: Headers
  }): Promise<ApiKeyCreated>

  listApiKeys(args: { headers: Headers }): Promise<ApiKeyRow[]>

  updateApiKey(args: {
    body: {
      keyId: string
      name?: string
      enabled?: boolean
      permissions?: Record<string, string[]> | null
      expiresIn?: number | null
      userId?: string
    }
    headers?: Headers
  }): Promise<ApiKeyRow>

  deleteApiKey(args: { body: { keyId: string }; headers: Headers }): Promise<{ success: boolean }>
}

interface BetterAuthApi extends Partial<ApiKeyAdminApi> {
  getSession(args: { headers: Headers }): Promise<{
    user?: {
      id: string
      email?: string
      name?: string
      image?: string | null
      [key: string]: unknown
    }
    session?: { id: string; expiresAt?: Date | string }
  } | null>

  signInEmail?(args: { body: { email: string; password: string } }): Promise<unknown>

  signOut?(args: { headers: Headers }): Promise<unknown>

  /** Optional, present when the @better-auth/api-key plugin is mounted. */
  verifyApiKey?(args: { body: { key: string; permissions?: Record<string, string[]> } }): Promise<{
    valid: boolean
    error: { code: string; message?: string } | null
    key: {
      id: string
      name: string | null
      referenceId: string
      enabled: boolean
      expiresAt: Date | string | null
      permissions?: Record<string, string[]> | null
      [k: string]: unknown
    } | null
  }>
}

/**
 * Structural shape we accept for the configured Better Auth instance.
 *
 * `api` is intentionally typed as `Record<string, unknown>` rather than the
 * strict `BetterAuthApi` interface above: at the type level, real Better Auth
 * exposes every `api.*` method as `Promise<Response>` (it's an HTTP endpoint
 * surface), but at runtime direct calls return the structured data objects
 * `BetterAuthApi` describes. Matching those two views structurally would force
 * consumers to write `auth as never` at every `new BetterAuthProvider({ auth })`
 * call site. Instead we widen the public type and cast once internally via
 * the `api` getter below.
 */
export interface BetterAuthInstance {
  api: Record<string, unknown>
  /**
   * Better Auth's resolved context (`auth.$context`). Used to read an API
   * key's row by id without re-verifying it — see `getCurrentUser`.
   */
  $context?: Promise<unknown>
  /** UI hint surface — list of enabled providers/passkeys/etc. */
  options?: { socialProviders?: Record<string, unknown>; emailAndPassword?: { enabled?: boolean } }
}

/**
 * What a direct `api.signInEmail()` call resolves to at runtime. Typed
 * separately because the endpoint is declared `Promise<unknown>` above — see
 * the note on {@link BetterAuthInstance}.
 */
type SignInEmailResult =
  | {
      user?: {
        id?: string
        email?: string
        name?: string
        image?: string | null
        [key: string]: unknown
      }
    }
  | null
  | undefined

interface RequestLike {
  headers: Headers | Record<string, string | string[] | undefined>
}

const toHeaders = (input: RequestLike['headers']): Headers => {
  if (input instanceof Headers) return input
  const headers = new Headers()
  for (const [key, value] of Object.entries(input)) {
    if (value == null) continue
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v))
    else headers.set(key, value)
  }
  return headers
}

/**
 * Better Auth error codes that mean "this email is already registered".
 * Matched on `code` (its stable API) rather than on the message text.
 */
const USER_EXISTS_CODES = new Set([
  'USER_ALREADY_EXISTS',
  'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
  'EMAIL_ALREADY_EXISTS',
])

/**
 * Raw unique-violation wording, per engine, for the fallback below:
 * Postgres `duplicate key value violates unique constraint "..."`,
 * MySQL `Duplicate entry '...' for key '...'`,
 * SQLite `UNIQUE constraint failed: user.email`.
 */
const DUPLICATE_MESSAGE = /already exists|duplicate (?:key|entry)|unique constraint/i

/**
 * Whether `err` is Better Auth's "user already exists" rejection.
 *
 * Prefers `err.body.code` / `err.code` — `APIError` carries both. The
 * message check is a last-resort fallback for versions or drivers that
 * surface a raw unique-constraint violation with no code at all; it names the
 * three engines' actual wording *and* requires the violation to concern the
 * email being seeded. Everything it does not match is reported as a real
 * failure rather than swallowed.
 */
const isUserAlreadyExistsError = (err: unknown, email: string): boolean => {
  if (typeof err !== 'object' || err === null) return false
  const candidate = err as { code?: unknown; body?: { code?: unknown }; message?: unknown }
  const code = candidate.body?.code ?? candidate.code
  if (typeof code === 'string' && USER_EXISTS_CODES.has(code)) return true
  const message = typeof candidate.message === 'string' ? candidate.message : ''
  if (!DUPLICATE_MESSAGE.test(message)) return false
  // A unique violation on some *other* column — a `username`, say — is not
  // "the admin is already there", and treating it as such would skip account
  // creation entirely. Require the message to be about the email.
  return /\bemail\b/i.test(message) || message.includes(email)
}

/** The api-key plugin's model, as it names it in adapter calls. */
const API_KEY_MODEL = 'apikey'

/** What `getCurrentUser` needs from an api-key row. */
interface ApiKeyClaimSource {
  id: string
  name: string | null
  referenceId: string
  enabled?: boolean
  permissions?: Record<string, string[]> | null
}

interface AdapterContext {
  adapter?: {
    findOne(args: {
      model: string
      where: Array<{ field: string; value: unknown }>
    }): Promise<Record<string, unknown> | null>
  }
}

/** The plugin stores `permissions` as a JSON string; normalise to the object form. */
const parsePermissions = (raw: unknown): Record<string, string[]> | null => {
  if (raw == null) return null
  if (typeof raw === 'object') return raw as Record<string, string[]>
  if (typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string[]>) : null
  } catch {
    return null
  }
}

const resolveSessionUserId = async (
  api: BetterAuthApi,
  headers: Headers | undefined,
): Promise<string> => {
  if (!headers) throw new Error('Not authenticated')
  const session = await api.getSession({ headers })
  if (!session?.user?.id) throw new Error('Not authenticated')
  return session.user.id
}

export interface BetterAuthProviderOptions {
  /** A configured `betterAuth({...})` instance. */
  auth: BetterAuthInstance
  /**
   * Where this provider's diagnostics go. Defaults to the console.
   *
   * Pass the same `ILogger` you gave `ModernAdminOptions.logger` so seeding
   * output lands in the host's log pipeline like everything else — writing
   * straight to `console` made it unroutable and unsilenceable.
   */
  logger?: ILogger
  /**
   * Headers carrying an existing admin session, used by `seedAdmin` to look
   * up an already-created root account so its role can be reconciled on
   * boot. Better Auth's `listUsers` and `setRole` are session-guarded
   * and there is no session during bootstrap, so without this the role is
   * only ever set on the boot that *creates* the account.
   *
   * Most deployments do not need it: set `admin.defaultRole` in Better Auth
   * and let the create path handle it.
   */
  seedAdminHeaders?: Headers | (() => Headers | Promise<Headers>)
  /**
   * Headers the api-key plugin reads the key from. Must mirror the plugin's
   * own `apiKeyHeaders` option (default `'x-api-key'`): a request presenting
   * a key in any of them is only authenticated once the key is verified and
   * attached as the principal's `apiKey` claim.
   */
  apiKeyHeaders?: string | readonly string[]
}

/** Better Auth api-key plugin's default `apiKeyHeaders`. */
const DEFAULT_API_KEY_HEADER = 'x-api-key'

export class BetterAuthProvider implements IAuthProvider {
  private readonly log: ILogger

  constructor(private readonly options: BetterAuthProviderOptions) {
    this.log = options.logger ?? new ConsoleLogger()
  }

  /** Internal accessor — narrows the widened `api` field back to BetterAuthApi. */
  private get api(): BetterAuthApi {
    return this.options.auth.api as unknown as BetterAuthApi
  }

  getUiProps(): Record<string, unknown> {
    const opts = this.options.auth.options ?? {}
    return {
      providers: Object.keys(opts.socialProviders ?? {}),
      emailAndPassword: Boolean(opts.emailAndPassword?.enabled),
    }
  }

  /**
   * `IAuthProvider.login` contract: the principal on success, `null` on
   * failure. Previously this returned `null` on success too, which is
   * indistinguishable from bad credentials for any caller that trusts the
   * port; the principal now comes from `signInEmail`'s own response body.
   *
   * Scope, deliberately: this verifies credentials, it does not establish a
   * browser session. A direct `auth.api.signInEmail({ body })` call has no
   * HTTP response to write `Set-Cookie` to — the SPA never goes through here,
   * it posts to Better Auth's own handler (mounted via
   * `createBetterAuthMiddleware`), which does set the cookie. Server-side
   * callers that want a session must plumb the response themselves.
   */
  async login(credentials: LoginCredentials): Promise<CurrentAdmin | null> {
    const api = this.api
    if (!api.signInEmail || !credentials.email || !credentials.password) return null
    let result: SignInEmailResult
    try {
      result = (await api.signInEmail({
        body: { email: credentials.email, password: credentials.password },
      })) as SignInEmailResult
    } catch {
      return null
    }
    const user = result?.user
    if (!user?.id) return null
    return {
      id: user.id,
      ...(user.email != null ? { email: user.email } : {}),
      ...(user.name != null ? { name: user.name } : {}),
      ...(user.image != null ? { avatarUrl: user.image } : {}),
      ...(typeof user.role === 'string' ? { role: user.role } : {}),
    }
  }

  async getCurrentUser(requestContext: unknown): Promise<CurrentAdmin | null> {
    const req = requestContext as RequestLike | undefined
    if (!req) return null
    const headers = toHeaders(req.headers)
    const apiKeyHeader = this.readApiKeyHeader(headers)

    let session: Awaited<ReturnType<BetterAuthApi['getSession']>>
    try {
      session = await this.api.getSession({ headers })
    } catch (err) {
      // The api-key plugin's session hook throws for a disabled, expired,
      // rate-limited or exhausted key. That is a rejected credential (401),
      // not a server fault.
      if (apiKeyHeader === null) throw err
      this.log.warn('[modern-admin] API key rejected by Better Auth', {
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
    if (!session?.user) return null

    const principal: CurrentAdmin = {
      id: session.user.id,
      ...(session.user.email != null ? { email: session.user.email } : {}),
      ...(session.user.name != null ? { name: session.user.name } : {}),
      ...(session.user.image != null ? { avatarUrl: session.user.image } : {}),
      // `role` is added to the session user by better-auth's admin plugin.
      // Cast through index signature — harmless when the plugin is absent.
      ...(typeof session.user.role === 'string' ? { role: session.user.role } : {}),
    }

    // A request carrying an API key must come out of here scoped to that key,
    // or not at all. Better Auth's api-key plugin turns the key into a session
    // for the key's *owner*, so the `principal` above has the owner's full
    // role; only the `apiKey` claim attached below narrows it in the core
    // gate. Every path that fails to attach the claim therefore returns
    // `null` — it used to fall through and hand the request the owner's
    // unrestricted session.
    if (apiKeyHeader === null) return principal

    const key = await this.resolveSessionApiKey(session, apiKeyHeader)
    if (!key) return null
    // The api-key plugin mints the session with `session.id = apiKey.id` and
    // `userId = apiKey.referenceId`. Anything else means getSession resolved
    // someone other than this key — a cookie session when
    // `enableSessionForAPIKeys` is off, or a header the plugin reads
    // differently from `apiKeyHeaders` here — and the claim cannot be trusted
    // to describe the principal.
    if (
      key.id !== session.session?.id ||
      key.referenceId !== session.user.id ||
      key.enabled === false
    ) {
      this.log.warn(
        '[modern-admin] API key does not match the session Better Auth resolved — rejecting it.',
      )
      return null
    }
    principal.apiKey = {
      id: key.id,
      ...(key.name != null ? { name: key.name } : {}),
      permissions: key.permissions ?? {},
    }
    return principal
  }

  /**
   * The api-key row behind a key-minted session, or `null` to reject.
   *
   * `getSession` has already run the plugin's full verification — enabled,
   * expiry, rate limit, `remaining` quota — and each verification consumes a
   * rate-limit slot and a unit of quota. Calling `verifyApiKey` on top of it
   * charged every request twice, halving the configured limit, and made the
   * *second* check the one that tripped. So the row is read by the session's
   * id instead; `verifyApiKey` is only the fallback when the row is not in
   * the database (secondary-storage-only mode, or no `$context`).
   */
  private async resolveSessionApiKey(
    session: NonNullable<Awaited<ReturnType<BetterAuthApi['getSession']>>>,
    apiKeyHeader: string,
  ): Promise<ApiKeyClaimSource | null> {
    const sessionId = session.session?.id
    if (sessionId) {
      const row = await this.findApiKeyRow(sessionId)
      if (row) return row
    }

    const verify = this.api.verifyApiKey
    if (!verify) {
      this.log.warn(
        '[modern-admin] request carries an API key, but this Better Auth instance has no ' +
          '`verifyApiKey` (api-key plugin not mounted) — rejecting it.',
      )
      return null
    }
    let result: Awaited<ReturnType<NonNullable<BetterAuthApi['verifyApiKey']>>>
    try {
      result = await verify({ body: { key: apiKeyHeader } })
    } catch (err) {
      this.log.warn('[modern-admin] API key verification failed — rejecting the request', {
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
    const key = result?.valid ? result.key : null
    if (!key) {
      this.log.warn('[modern-admin] API key rejected on verification', {
        ...(result?.error?.code ? { code: result.error.code } : {}),
      })
      return null
    }
    return key
  }

  /**
   * Read an api-key row by id through Better Auth's adapter; `null` when it
   * cannot be read, which sends the caller to the `verifyApiKey` fallback.
   */
  private async findApiKeyRow(id: string): Promise<ApiKeyClaimSource | null> {
    let context: AdapterContext | undefined
    try {
      context = (await this.options.auth.$context) as AdapterContext | undefined
    } catch {
      return null
    }
    const adapter = context?.adapter
    if (typeof adapter?.findOne !== 'function') return null
    let row: Record<string, unknown> | null
    try {
      row = await adapter.findOne({ model: API_KEY_MODEL, where: [{ field: 'id', value: id }] })
    } catch {
      return null
    }
    if (!row || typeof row.id !== 'string' || typeof row.referenceId !== 'string') return null
    return {
      id: row.id,
      name: typeof row.name === 'string' ? row.name : null,
      referenceId: row.referenceId,
      ...(typeof row.enabled === 'boolean' ? { enabled: row.enabled } : {}),
      permissions: parsePermissions(row.permissions),
    }
  }

  /**
   * The API key the request presents, or `null` when it presents none. Reads
   * the same header list the api-key plugin is configured with
   * (`apiKeyHeaders`), first non-empty value wins — matching the plugin.
   */
  private readApiKeyHeader(headers: Headers): string | null {
    const names = this.options.apiKeyHeaders ?? DEFAULT_API_KEY_HEADER
    for (const name of typeof names === 'string' ? [names] : names) {
      const value = headers.get(name)
      if (value) return value
    }
    return null
  }

  async logout(requestContext: unknown): Promise<void> {
    const req = requestContext as RequestLike | undefined
    if (!req || !this.api.signOut) return
    await this.api.signOut({ headers: toHeaders(req.headers) })
  }

  /**
   * Create the root admin on first boot via Better Auth's `signUpEmail`, and
   * reconcile its role on every boot.
   *
   * Idempotent. Three behaviours worth calling out, all of which used to be
   * wrong:
   *
   * - **The role is reconciled for existing accounts too — when it can be.**
   *   The "already exists" branch used to `return` before `setRole` ran,
   *   so changing `rootAdmin.role` in config had no effect after the first
   *   boot ever. Reconciling needs the existing user's id, and the only
   *   public way to get it is the admin plugin's `listUsers`, which is
   *   session-guarded — at boot there is no session, so this generally
   *   succeeds only when the host passes `seedAdminHeaders`. Without them the
   *   provider says so in the log instead of failing silently.
   * - **Existence is detected by Better Auth's error `code`**, not by
   *   regex-matching the message. A message regex is not a contract: against
   *   a `^1.6.0` peer range one reworded string turns "already present" into
   *   "seed failed", and every non-matching error — a wrong `DATABASE_URL`, a
   *   rejected password policy — used to be swallowed into a warning that
   *   read exactly like success.
   * - **Logs say the role that was actually requested**, not a hardcoded
   *   "root admin", and go through the configured {@link ILogger}.
   */
  async seedAdmin(opts: {
    email: string
    password: string
    name?: string
    role?: string
  }): Promise<void> {
    const api = this.api as BetterAuthApi & {
      signUpEmail?: (args: {
        body: { email: string; password: string; name: string }
      }) => Promise<{ user?: { id?: string } } | null>
      setRole?: (args: {
        body: { userId: string; role: string }
        headers?: Headers
      }) => Promise<unknown>
      listUsers?: (args: {
        query: { filterField?: string; filterValue?: string; limit?: number }
      }) => Promise<{ users?: Array<{ id?: string }> } | null>
    }

    if (typeof api.signUpEmail !== 'function') return

    const name = opts.name ?? opts.email.split('@')[0] ?? 'Admin'
    let userId: string | undefined

    try {
      const result = await api.signUpEmail({
        body: { email: opts.email, password: opts.password, name },
      })
      userId = result?.user?.id
      // Says only what has happened. The role comes from Better Auth's
      // `admin.defaultRole` at this point; `opts.role` is applied below, and
      // is logged there — after `setRole` actually returns.
      this.log.info(`[modern-admin] created admin ${opts.email}`)
    } catch (err) {
      if (!isUserAlreadyExistsError(err, opts.email)) {
        // Not "already there" — surface it. A silent warn here is how a bad
        // DATABASE_URL looked identical to a successful boot.
        this.log.error(`[modern-admin] admin seed failed for ${opts.email}`, {
          error: err instanceof Error ? err.message : String(err),
        })
        return
      }
      this.log.info(`[modern-admin] admin ${opts.email} already present`)
      if (opts.role) userId = await this.findExistingUserId(api, opts.email)
    }

    // Reconcile the role on every boot, for freshly created *and* existing
    // accounts, so config stays the source of truth.
    if (!opts.role || !userId) return
    if (typeof api.setRole !== 'function') {
      this.log.warn(
        `[modern-admin] role '${opts.role}' requested for ${opts.email}, but this Better Auth ` +
          'instance has no admin plugin (`setRole` is absent) — the account keeps its default role.',
      )
      return
    }
    try {
      await api.setRole({
        body: { userId, role: opts.role },
        ...(await this.seedHeaders()),
      })
      this.log.info(`[modern-admin] admin ${opts.email} set to role '${opts.role}'`)
    } catch (err) {
      // Best-effort: the account exists either way.
      this.log.warn(`[modern-admin] could not set role '${opts.role}' for ${opts.email}`, {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /** `{ headers }` when the host configured them, otherwise `{}`. */
  private async seedHeaders(): Promise<{ headers?: Headers }> {
    const raw = this.options.seedAdminHeaders
    if (!raw) return {}
    return { headers: typeof raw === 'function' ? await raw() : raw }
  }

  /**
   * Resolve an existing account's id so its role can be reconciled.
   *
   * Better Auth's `listUsers` sits behind its session middleware, and boot
   * has no session — so without `seedAdminHeaders` this cannot work, and the
   * honest thing is to say which knob is missing rather than swallow the
   * rejection and leave the role quietly unchanged.
   */
  private async findExistingUserId(
    api: {
      listUsers?: (args: {
        query: { filterField?: string; filterValue?: string; limit?: number }
        headers?: Headers
      }) => Promise<{ users?: Array<{ id?: string }> } | null>
    },
    email: string,
  ): Promise<string | undefined> {
    if (typeof api.listUsers !== 'function') {
      this.log.warn(
        `[modern-admin] cannot reconcile the role of the existing admin ${email}: ` +
          'this Better Auth instance has no admin plugin (`listUsers` is absent).',
      )
      return undefined
    }
    try {
      const result = await api.listUsers({
        query: { filterField: 'email', filterValue: email, limit: 1 },
        ...(await this.seedHeaders()),
      })
      const found = result?.users?.[0]?.id
      if (!found) {
        this.log.warn(
          `[modern-admin] admin ${email} exists but could not be looked up; role left unchanged.`,
        )
      }
      return found
    } catch (err) {
      this.log.warn(
        `[modern-admin] cannot reconcile the role of the existing admin ${email}. ` +
          '`listUsers` is session-guarded and bootstrap has no session — pass ' +
          '`seedAdminHeaders` to BetterAuthProvider if you need the role kept in sync.',
        { error: err instanceof Error ? err.message : String(err) },
      )
      return undefined
    }
  }

  /**
   * Returns the api-key admin surface (create/list/update/delete) when the
   * better-auth instance has the api-key plugin mounted; `null` otherwise.
   * Transports use this to expose Settings → API Keys CRUD without binding
   * to better-auth internals directly.
   */
  getApiKeyAdmin(): ApiKeyAdminApi | null {
    const api = this.api
    const { createApiKey, listApiKeys, updateApiKey, deleteApiKey } = api
    if (
      typeof createApiKey !== 'function' ||
      typeof listApiKeys !== 'function' ||
      typeof updateApiKey !== 'function' ||
      typeof deleteApiKey !== 'function'
    ) {
      return null
    }
    return {
      createApiKey: async ({ body, headers }) => {
        const userId = await resolveSessionUserId(api, headers)
        return createApiKey({
          body: {
            ...body,
            userId,
          },
        })
      },
      listApiKeys: listApiKeys.bind(api),
      updateApiKey: async ({ body, headers }) => {
        const hasServerOnlyFields =
          body.enabled !== undefined ||
          body.permissions !== undefined ||
          body.expiresIn !== undefined
        if (!hasServerOnlyFields) {
          if (!headers) throw new Error('Not authenticated')
          return updateApiKey({ body, headers })
        }
        const userId = await resolveSessionUserId(api, headers)
        return updateApiKey({
          body: {
            ...body,
            userId,
          },
        })
      },
      deleteApiKey: deleteApiKey.bind(api),
    }
  }
}
