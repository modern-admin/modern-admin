// Tiny `fetch` wrapper aimed at the @modern-admin/nest REST surface. We avoid
// pulling axios — the host browser already has fetch, and TanStack Query gives
// us retry/dedup/caching anyway.

import type { DashboardBlob } from '@modern-admin/core'
import type {
  AdminConfig,
  CustomActionResponse,
  CurrentUser,
  ListQuery,
  ListResponse,
  RecordResponse,
} from './types.js'

export interface AuthUiProps {
  /** Enabled OAuth provider ids, e.g. ['google', 'github']. */
  providers: string[]
  emailAndPassword: boolean
}

interface StoredDemoSession {
  email: string
  password: string
}

const DEFAULT_DEMO_SESSION_STORAGE_KEY = 'modern-admin:demo-session:v1'

export interface AdminClientOptions {
  /** Absolute base URL of the API, e.g. http://localhost:3001 — defaults to same-origin. */
  baseUrl?: string
  /** Send credentials with every request (cookies for Better Auth sessions). */
  credentials?: RequestCredentials
  /** Optional global headers (auth tokens, CSRF). */
  headers?: Record<string, string>
  persistDemoSession?: boolean
  demoSessionStorageKey?: string
  /**
   * Path under which the host mounts Better Auth's Node handler
   * (`toNodeHandler(auth)`) AND configures `betterAuth({ basePath })`.
   * Drives the sign-in / sign-out endpoints — defaults to
   * `/admin/api/auth`, matching the canonical CLI scaffold. Override only
   * if the host mounts Better Auth elsewhere; pass *without* a trailing
   * slash, e.g. `'/api/auth'` (Better Auth's own default).
   */
  authBasePath?: string
}

const DEFAULT_AUTH_BASE_PATH = '/admin/api/auth'

const buildQuery = (query?: ListQuery): string => {
  if (!query) return ''
  const params = new URLSearchParams()
  if (query.page != null) params.set('page', String(query.page))
  if (query.perPage != null) params.set('perPage', String(query.perPage))
  if (query.sortBy) params.set('sortBy', query.sortBy)
  if (query.direction) params.set('direction', query.direction)
  if (query.filters) {
    // Bracket notation — Express's qs parser turns `filters[k]=v` into
    // `query.filters = { k: 'v' }` which is what the list action expects.
    for (const [k, v] of Object.entries(query.filters)) {
      if (v !== '' && v != null) params.set(`filters[${k}]`, v)
    }
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export class AdminClient {
  private readonly baseUrl: string
  private readonly credentials: RequestCredentials
  private readonly headers: Record<string, string>
  private readonly demoSessionStorageKey: string | null
  private readonly authBasePath: string
  private readonly signInPath: string
  private readonly signOutPath: string

  constructor(opts: AdminClientOptions = {}) {
    this.baseUrl = opts.baseUrl?.replace(/\/$/, '') ?? ''
    this.credentials = opts.credentials ?? 'include'
    this.headers = opts.headers ?? {}
    this.demoSessionStorageKey = opts.persistDemoSession
      ? (opts.demoSessionStorageKey ?? DEFAULT_DEMO_SESSION_STORAGE_KEY)
      : null
    this.authBasePath = (opts.authBasePath ?? DEFAULT_AUTH_BASE_PATH).replace(/\/$/, '')
    this.signInPath = `${this.authBasePath}/sign-in/email`
    this.signOutPath = `${this.authBasePath}/sign-out`
  }

  /** Base URL the client was configured with ('' = same-origin). The
   *  realtime bridge derives the WS endpoint from it. */
  get apiBaseUrl(): string {
    return this.baseUrl
  }

  private async requestOnce<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      credentials: this.credentials,
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
        ...(init.headers as Record<string, string> | undefined),
      },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new AdminApiError(res.status, text || res.statusText)
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  private async request<T>(path: string, init: RequestInit = {}, allowDemoRestore = true): Promise<T> {
    try {
      return await this.requestOnce<T>(path, init)
    } catch (err) {
      const canRestore =
        allowDemoRestore &&
        err instanceof AdminApiError &&
        err.status === 401 &&
        path !== this.signInPath &&
        path !== this.signOutPath
      if (!canRestore) throw err
      const restored = await this.restoreDemoSession()
      if (!restored) throw err
      return this.requestOnce<T>(path, init)
    }
  }

  private readDemoSession(): StoredDemoSession | null {
    if (!this.demoSessionStorageKey || typeof window === 'undefined') return null
    try {
      const raw = window.localStorage.getItem(this.demoSessionStorageKey)
      if (!raw) return null
      const parsed = JSON.parse(raw) as Partial<StoredDemoSession>
      if (typeof parsed.email !== 'string' || typeof parsed.password !== 'string') return null
      return { email: parsed.email, password: parsed.password }
    } catch {
      return null
    }
  }

  private writeDemoSession(session: StoredDemoSession): void {
    if (!this.demoSessionStorageKey || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(this.demoSessionStorageKey, JSON.stringify(session))
    } catch {
      return
    }
  }

  private clearDemoSession(): void {
    if (!this.demoSessionStorageKey || typeof window === 'undefined') return
    try {
      window.localStorage.removeItem(this.demoSessionStorageKey)
    } catch {
      return
    }
  }

  private async restoreDemoSession(): Promise<boolean> {
    const session = this.readDemoSession()
    if (!session) return false
    try {
      await this.request<unknown>(this.signInPath, {
        method: 'POST',
        body: JSON.stringify(session),
      })
      return true
    } catch {
      this.clearDemoSession()
      return false
    }
  }

  config(): Promise<AdminConfig> {
    return this.request<AdminConfig>('/admin/api/config')
  }

  /** Resolve the current authenticated admin. Throws AdminApiError(401) when
   *  unauthenticated — callers should branch on that to render login. */
  me(): Promise<{ user: CurrentUser }> {
    return this.request<{ user: CurrentUser }>('/admin/api/auth/me')
  }

  /** Email/password login via the host-mounted Better Auth handler. The
   *  endpoint sets an http-only session cookie that subsequent requests
   *  rely on (`credentials: 'include'`). The audit-log entry is written
   *  server-side by Better Auth's `session.create.after` hook, which
   *  covers email/password, OAuth, passkey and api-key flows uniformly. */
  async login(email: string, password: string): Promise<void> {
    await this.request<unknown>(this.signInPath, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    this.writeDemoSession({ email, password })
  }

  /** Fetch public auth UI metadata: which social providers are enabled,
   *  whether email/password login is active. The endpoint is unauthenticated. */
  getAuthUiProps(): Promise<AuthUiProps> {
    return this.requestOnce<AuthUiProps>('/admin/api/auth/ui-props')
  }

  /** Initiate an OAuth social-login flow. Calls Better Auth's sign-in/social
   *  endpoint which returns a redirect URL, then navigates the browser there.
   *  `callbackUrl` defaults to the current page so the app re-checks auth
   *  after the provider redirects back. */
  async loginSocial(provider: string, callbackUrl?: string): Promise<void> {
    const resolved =
      callbackUrl ?? (typeof window !== 'undefined' ? window.location.href : '/')
    const data = await this.requestOnce<{ url?: string }>(
      `${this.authBasePath}/sign-in/social`,
      {
        method: 'POST',
        body: JSON.stringify({ provider, callbackURL: resolved }),
      },
    )
    if (data.url && typeof window !== 'undefined') {
      window.location.href = data.url
    }
  }

  /** Sign the current session out. Better Auth's sign-out endpoint requires
   *  an explicit JSON body (even if empty) when Content-Type is JSON. */
  async logout(): Promise<void> {
    try {
      await this.request<unknown>(this.signOutPath, {
        method: 'POST',
        body: '{}',
      })
    } finally {
      this.clearDemoSession()
    }
  }

  list(resourceId: string, query?: ListQuery): Promise<ListResponse> {
    return this.request<ListResponse>(
      `/admin/api/resources/${encodeURIComponent(resourceId)}/actions/list${buildQuery(query)}`,
    )
  }

  show(resourceId: string, recordId: string): Promise<RecordResponse> {
    return this.request<RecordResponse>(
      `/admin/api/resources/${encodeURIComponent(resourceId)}/records/${encodeURIComponent(recordId)}/actions/show`,
    )
  }

  create(resourceId: string, payload: Record<string, unknown>): Promise<RecordResponse> {
    return this.request<RecordResponse>(
      `/admin/api/resources/${encodeURIComponent(resourceId)}/actions/new`,
      { method: 'POST', body: JSON.stringify(payload) },
    )
  }

  update(
    resourceId: string,
    recordId: string,
    payload: Record<string, unknown>,
  ): Promise<RecordResponse> {
    return this.request<RecordResponse>(
      `/admin/api/resources/${encodeURIComponent(resourceId)}/records/${encodeURIComponent(recordId)}/actions/edit`,
      { method: 'PATCH', body: JSON.stringify(payload) },
    )
  }

  delete(resourceId: string, recordId: string): Promise<void> {
    return this.request<void>(
      `/admin/api/resources/${encodeURIComponent(resourceId)}/records/${encodeURIComponent(recordId)}/actions/delete`,
      { method: 'DELETE' },
    )
  }

  /** Bulk-delete a set of records via the resource's `bulkDelete` action. */
  bulkDelete(resourceId: string, recordIds: ReadonlyArray<string>): Promise<unknown> {
    return this.request<unknown>(
      `/admin/api/resources/${encodeURIComponent(resourceId)}/actions/bulkDelete`,
      { method: 'POST', body: JSON.stringify({ recordIds }) },
    )
  }

  /** Fetch distinct values for a field — used by the filter value picker.
   *  Returns `{ values, hasMore }`. */
  distinctValues(
    resourceId: string,
    field: string,
    options?: { search?: string; limit?: number },
  ): Promise<{ values: string[]; hasMore: boolean }> {
    const params = new URLSearchParams({ field })
    if (options?.search) params.set('search', options.search)
    if (options?.limit != null) params.set('limit', String(options.limit))
    return this.request<{ values: string[]; hasMore: boolean }>(
      `/admin/api/resources/${encodeURIComponent(resourceId)}/actions/values?${params.toString()}`,
    )
  }

  search(resourceId: string, query: string): Promise<ListResponse> {
    const qs = query ? `?q=${encodeURIComponent(query)}` : ''
    return this.request<ListResponse>(
      `/admin/api/resources/${encodeURIComponent(resourceId)}/actions/search${qs}`,
    )
  }

  /** Cross-resource search. Fans `query` out to every registered resource's
   *  `search` action; resources the principal cannot access are omitted.
   *
   *  Accepts an optional `AbortSignal` so the command-palette dialog can
   *  cancel an in-flight request when the user keeps typing — without this
   *  the server is hit once per keystroke and stale responses race with
   *  newer ones. */
  globalSearch(
    query: string,
    perResourceLimit?: number,
    options: { signal?: AbortSignal } = {},
  ): Promise<GlobalSearchResponse> {
    const params = new URLSearchParams({ q: query })
    if (perResourceLimit != null) params.set('perResourceLimit', String(perResourceLimit))
    return this.request<GlobalSearchResponse>(
      `/admin/api/global-search?${params.toString()}`,
      options.signal ? { signal: options.signal } : {},
    )
  }

  /** Invoke a custom record-scoped action (actionType: 'record'). */
  invokeRecordAction(
    resourceId: string,
    recordId: string,
    actionName: string,
    payload: Record<string, unknown> = {},
  ): Promise<CustomActionResponse> {
    return this.request<CustomActionResponse>(
      `/admin/api/resources/${encodeURIComponent(resourceId)}/records/${encodeURIComponent(recordId)}/actions/${encodeURIComponent(actionName)}`,
      { method: 'POST', body: JSON.stringify(payload) },
    )
  }

  /** Invoke a custom bulk-scoped action (actionType: 'bulk'). */
  invokeBulkAction(
    resourceId: string,
    actionName: string,
    recordIds: ReadonlyArray<string>,
  ): Promise<CustomActionResponse> {
    return this.request<CustomActionResponse>(
      `/admin/api/resources/${encodeURIComponent(resourceId)}/actions/${encodeURIComponent(actionName)}`,
      { method: 'POST', body: JSON.stringify({ recordIds: Array.from(recordIds) }) },
    )
  }

  /** Invoke a custom resource-scoped action (actionType: 'resource'). */
  invokeResourceAction(
    resourceId: string,
    actionName: string,
    payload: Record<string, unknown> = {},
  ): Promise<CustomActionResponse> {
    return this.request<CustomActionResponse>(
      `/admin/api/resources/${encodeURIComponent(resourceId)}/actions/${encodeURIComponent(actionName)}`,
      { method: 'POST', body: JSON.stringify(payload) },
    )
  }

  /**
   * Run a time-series aggregation. KPI mode = `step: 'all'`. Multi-series
   * via secondary `groupBy` (top-N truncation server-side).
   */
  timeseries(query: TimeSeriesQuery): Promise<TimeSeriesResponse> {
    const body: Record<string, unknown> = {
      resource: query.resource,
      dateField: query.dateField,
      step: query.step,
      metric: query.metric,
      from: toIsoDateTime(query.from, 'start'),
      to: toIsoDateTime(query.to, 'end'),
    }
    if (query.field) body.field = query.field
    if (query.groupBy) body.groupBy = query.groupBy
    if (query.topN != null) body.topN = query.topN
    if (query.filters && Object.keys(query.filters).length) {
      body.filters = query.filters
    }
    if (query.comparePrevious) body.comparePrevious = true
    if (query.groupByLabelResource) body.groupByLabelResource = query.groupByLabelResource
    return this.request<TimeSeriesResponse>('/admin/api/timeseries', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  listHistory(
    resourceId: string,
    recordId: string,
    query: { limit?: number; offset?: number } = {},
  ): Promise<HistoryListResponse> {
    const params = new URLSearchParams()
    if (query.limit != null) params.set('limit', String(query.limit))
    if (query.offset != null) params.set('offset', String(query.offset))
    const qs = params.toString() ? `?${params.toString()}` : ''
    return this.request<HistoryListResponse>(
      `/admin/api/resources/${encodeURIComponent(resourceId)}/records/${encodeURIComponent(recordId)}/history${qs}`,
    )
  }

  getHistoryRevision(
    resourceId: string,
    recordId: string,
    revisionId: string,
  ): Promise<HistoryRevisionResponse> {
    return this.request<HistoryRevisionResponse>(
      `/admin/api/resources/${encodeURIComponent(resourceId)}/records/${encodeURIComponent(recordId)}/history/${encodeURIComponent(revisionId)}`,
    )
  }

  revertHistoryRevision(
    resourceId: string,
    recordId: string,
    revisionId: string,
    body: { reason?: string } = {},
  ): Promise<RecordResponse> {
    return this.request<RecordResponse>(
      `/admin/api/resources/${encodeURIComponent(resourceId)}/records/${encodeURIComponent(recordId)}/history/${encodeURIComponent(revisionId)}/revert`,
      { method: 'POST', body: JSON.stringify(body) },
    )
  }

  listAuditLog(query: AuditLogQuery = {}): Promise<AuditLogResponse> {
    const params = new URLSearchParams()
    if (query.resourceId) params.set('resourceId', query.resourceId)
    if (query.recordId) params.set('recordId', query.recordId)
    if (query.userId) params.set('userId', query.userId)
    if (query.actions?.length) params.set('actions', query.actions.join(','))
    if (query.from) params.set('from', toIsoDateTime(query.from, 'start'))
    if (query.to) params.set('to', toIsoDateTime(query.to, 'end'))
    if (query.limit != null) params.set('limit', String(query.limit))
    if (query.offset != null) params.set('offset', String(query.offset))
    if (query.before != null) params.set('before', String(query.before))
    const qs = params.toString() ? `?${params.toString()}` : ''
    return this.request<AuditLogResponse>(`/admin/api/audit-log${qs}`)
  }

  /**
   * Upload a single file for a `type: 'file'` property, reporting progress
   * via `options.onProgress`. Uses `XMLHttpRequest` because the fetch API
   * does not expose upload-side progress events.
   *
   * Returns the metadata record for the uploaded file. The server endpoint
   * (`POST /admin/api/resources/:id/actions/upload`) accepts batch uploads
   * and replies with an array; we send one file per request and unwrap the
   * single result so the caller gets per-file progress and per-file errors.
   */
  uploadFile(
    resourceId: string,
    field: string,
    file: File,
    options: UploadFileOptions = {},
  ): Promise<UploadedFileInfo> {
    const url = `${this.baseUrl}/admin/api/resources/${encodeURIComponent(resourceId)}/actions/upload?field=${encodeURIComponent(field)}`
    const form = new FormData()
    form.append('files', file)
    return new Promise<UploadedFileInfo>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', url, true)
      xhr.withCredentials = this.credentials !== 'omit'
      for (const [k, v] of Object.entries(this.headers)) xhr.setRequestHeader(k, v)
      xhr.responseType = 'text'
      xhr.upload.onprogress = (ev): void => {
        if (!options.onProgress) return
        const total = ev.lengthComputable ? ev.total : file.size
        const loaded = ev.loaded
        options.onProgress({
          loaded,
          total,
          percent: total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0,
        })
      }
      xhr.onload = (): void => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const arr = JSON.parse(xhr.responseText) as UploadedFileInfo[]
            const first = arr[0]
            if (!first) {
              reject(new AdminApiError(500, 'Server returned no upload result'))
              return
            }
            // Emit a final 100% progress tick so UI can settle the bar.
            options.onProgress?.({ loaded: file.size, total: file.size, percent: 100 })
            resolve(first)
          } catch (err) {
            reject(new AdminApiError(500, err instanceof Error ? err.message : 'Invalid upload response'))
          }
        } else {
          reject(new AdminApiError(xhr.status, xhr.responseText || xhr.statusText))
        }
      }
      xhr.onerror = (): void => reject(new AdminApiError(0, 'Network error during upload'))
      xhr.onabort = (): void => reject(new AdminApiError(0, 'Upload aborted'))
      if (options.signal) {
        if (options.signal.aborted) {
          xhr.abort()
          return
        }
        options.signal.addEventListener('abort', () => xhr.abort(), { once: true })
      }
      xhr.send(form)
    })
  }

  /**
   * Upload many files with bounded concurrency, reporting per-file progress
   * via `options.onItem*` callbacks. Each file is sent in its own request,
   * so partial failures do not affect already-completed uploads.
   *
   * Returns the array of successful results in the order files were passed.
   * Failed entries are omitted from the returned array; consumers wanting
   * to react to failures should observe `onItemError`.
   */
  async uploadFiles(
    resourceId: string,
    field: string,
    files: ReadonlyArray<File>,
    options: UploadFilesOptions = {},
  ): Promise<UploadedFileInfo[]> {
    if (files.length === 0) return []
    const concurrency = Math.max(1, options.concurrency ?? 3)
    const results: Array<UploadedFileInfo | null> = new Array(files.length).fill(null)
    let cursor = 0
    const runOne = async (): Promise<void> => {
      while (true) {
        const i = cursor++
        if (i >= files.length) return
        const file = files[i]!
        options.onItemStart?.(i, file)
        try {
          const info = await this.uploadFile(resourceId, field, file, {
            signal: options.signal,
            onProgress: (p) => options.onItemProgress?.(i, file, p),
          })
          results[i] = info
          options.onItemComplete?.(i, file, info)
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err))
          options.onItemError?.(i, file, e)
        }
      }
    }
    const workers = Array.from({ length: Math.min(concurrency, files.length) }, () => runOne())
    await Promise.all(workers)
    return results.filter((r): r is UploadedFileInfo => r != null)
  }

  /** Load the current user's dashboard layout from the server config store. */
  loadDashboard(): Promise<{ dashboard: DashboardBlob }> {
    return this.request<{ dashboard: DashboardBlob }>('/admin/api/dashboard')
  }

  /** Persist the current user's dashboard layout to the server config store. */
  saveDashboard(dashboard: DashboardBlob): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>('/admin/api/dashboard', {
      method: 'PUT',
      body: JSON.stringify(dashboard),
    })
  }

  /** List API keys belonging to the current admin. */
  listApiKeys(): Promise<{ keys: ApiKeyRecord[] }> {
    return this.request<{ keys: ApiKeyRecord[] }>('/admin/api/api-keys')
  }

  /** Create a new API key. The plaintext secret is returned exactly once. */
  createApiKey(payload: {
    name: string
    permissions: Record<string, string[]>
    expiresInDays?: number | null
  }): Promise<{ key: string; record: ApiKeyRecord }> {
    return this.request<{ key: string; record: ApiKeyRecord }>('/admin/api/api-keys', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  /** Patch a key — name/enabled/permissions/expiry. */
  updateApiKey(
    id: string,
    payload: {
      name?: string
      enabled?: boolean
      permissions?: Record<string, string[]>
      expiresInDays?: number | null
    },
  ): Promise<{ record: ApiKeyRecord }> {
    return this.request<{ record: ApiKeyRecord }>(
      `/admin/api/api-keys/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(payload) },
    )
  }

  /** Permanently revoke (delete) an API key. */
  deleteApiKey(id: string): Promise<{ success: true }> {
    return this.request<{ success: true }>(
      `/admin/api/api-keys/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    )
  }

  listWebhooks(): Promise<{ webhooks: WebhookRecord[] }> {
    return this.request<{ webhooks: WebhookRecord[] }>('/admin/api/webhooks')
  }

  createWebhook(payload: WebhookInput): Promise<{ webhook: WebhookRecord }> {
    return this.request<{ webhook: WebhookRecord }>('/admin/api/webhooks', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  updateWebhook(id: string, payload: Partial<WebhookInput>): Promise<{ webhook: WebhookRecord }> {
    return this.request<{ webhook: WebhookRecord }>(
      `/admin/api/webhooks/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(payload) },
    )
  }

  deleteWebhook(id: string): Promise<{ success: true }> {
    return this.request<{ success: true }>(
      `/admin/api/webhooks/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    )
  }

  listWebhookDeliveries(id: string, limit = 50): Promise<{ deliveries: WebhookDeliveryRecord[] }> {
    return this.request<{ deliveries: WebhookDeliveryRecord[] }>(
      `/admin/api/webhooks/${encodeURIComponent(id)}/deliveries?limit=${encodeURIComponent(String(limit))}`,
    )
  }

  testWebhook(id: string): Promise<{ success: true }> {
    return this.request<{ success: true }>(
      `/admin/api/webhooks/${encodeURIComponent(id)}/test`,
      { method: 'POST', body: '{}' },
    )
  }

  /**
   * Cancel a still-pending upload — deletes the file from storage immediately.
   * Use when the user removes a freshly uploaded file *before* saving the
   * form. Files that have already been confirmed (record saved) cannot be
   * cancelled via this endpoint and the call will reject with 404.
   */
  async cancelUpload(resourceId: string, field: string, key: string): Promise<void> {
    const qs = `?field=${encodeURIComponent(field)}&key=${encodeURIComponent(key)}`
    const res = await fetch(
      `${this.baseUrl}/admin/api/resources/${encodeURIComponent(resourceId)}/actions/upload${qs}`,
      { method: 'DELETE', credentials: this.credentials, headers: this.headers },
    )
    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => '')
      throw new AdminApiError(res.status, text || res.statusText)
    }
  }

  /**
   * Send a single image to the resource's `aiFill` action and receive a
   * `values` map the edit form can hydrate from. Uses multipart/form-data
   * because vision models expect raw bytes, not base64-stringified payloads.
   *
   * Supports an optional `signal` for cancellation and the demo-session 401
   * auto-restore logic (matching the behaviour of `request()`). Cannot use
   * `requestOnce` directly because that always sets `Content-Type: application/json`,
   * which would override the browser-generated multipart boundary.
   */
  async aiFillFromImage(
    resourceId: string,
    file: File,
    options: { signal?: AbortSignal } = {},
  ): Promise<AiFillResponse> {
    const url = `${this.baseUrl}/admin/api/resources/${encodeURIComponent(resourceId)}/ai-fill`

    const doFetch = async (): Promise<AiFillResponse> => {
      const form = new FormData()
      form.append('image', file)
      const res = await fetch(url, {
        method: 'POST',
        credentials: this.credentials,
        // Intentionally omit Content-Type — the browser sets it automatically
        // with the correct multipart/form-data boundary.
        headers: this.headers,
        body: form,
        signal: options.signal,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new AdminApiError(res.status, text || res.statusText)
      }
      return (await res.json()) as AiFillResponse
    }

    try {
      return await doFetch()
    } catch (err) {
      const canRestore =
        err instanceof AdminApiError &&
        err.status === 401 &&
        !options.signal?.aborted
      if (!canRestore) throw err
      const restored = await this.restoreDemoSession()
      if (!restored) throw err
      return doFetch()
    }
  }

  getAiAssistantSettings(): Promise<AiAssistantSettings> {
    return this.request<AiAssistantSettings>('/admin/api/ai-assistant/settings')
  }

  async updateAiAssistantSettings(payload: {
    enabled: boolean
    model: string
    apiKey?: string
    systemPrompt?: string
  }): Promise<AiAssistantSettings> {
    return this.request<AiAssistantSettings>('/admin/api/ai-assistant/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  async sendAiAssistantChat(
    messages: AiAssistantChatMessage[],
    requestId?: string,
    locale?: string,
    conversationId?: string,
    clientContext?: AiClientContext,
  ): Promise<AiAssistantChatEnqueueResponse> {
    return this.request<AiAssistantChatEnqueueResponse>('/admin/api/ai-assistant/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages,
        ...(requestId ? { requestId } : {}),
        ...(locale ? { locale } : {}),
        ...(conversationId ? { conversationId } : {}),
        ...(clientContext ? { clientContext } : {}),
      }),
    })
  }

  async listAiAssistantChats(): Promise<AiAssistantChatHistoryItem[]> {
    return this.request<AiAssistantChatHistoryItem[]>('/admin/api/ai-assistant/chats')
  }

  async getAiAssistantTask(taskId: string): Promise<AiAssistantTask> {
    return this.request<AiAssistantTask>(`/admin/api/ai-assistant/tasks/${encodeURIComponent(taskId)}`)
  }

}

// ─── Time-series ──────────────────────────────────────────────────────────

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

const toIsoDateTime = (value: string, edge: 'start' | 'end'): string => {
  if (DATE_ONLY_RE.test(value)) {
    return `${value}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

export type TimeSeriesMetric = 'count' | 'sum' | 'avg' | 'min' | 'max'
export type TimeSeriesStep = 'day' | 'week' | 'month' | 'year' | 'all'

export interface TimeSeriesQuery {
  resource: string
  /** Property path of the date/datetime column used for X-axis bucketing. */
  dateField: string
  step: TimeSeriesStep
  metric: TimeSeriesMetric
  /** Required for non-count metrics. */
  field?: string
  /** Optional secondary breakdown — produces one series per distinct value. */
  groupBy?: string
  /** Maximum series count for grouped charts. Default 10. */
  topN?: number
  /**
   * When set, the server resolves each non-special series key (FK id) to a
   * human-readable title via `findMany` on this resource.
   */
  groupByLabelResource?: string
  /** ISO datetime, inclusive start. */
  from: string
  /** ISO datetime, inclusive end. */
  to: string
  /** List-page-style filters narrowing the dataset. */
  filters?: Record<string, string>
  /** When true, response includes the equal-length previous window (KPI delta). */
  comparePrevious?: boolean
}

export interface TimeSeriesPoint {
  /** ISO date `YYYY-MM-DD`. */
  date: string
  value: number
}

export interface TimeSeriesSeries {
  /** Series identifier. `'__total__'` when no `groupBy` is set, `'__other__'` for the topN remainder. */
  key: string
  points: TimeSeriesPoint[]
}

export interface TimeSeriesResponse {
  series: TimeSeriesSeries[]
  /** Populated when the request used `comparePrevious: true`. */
  previous?: TimeSeriesSeries[]
  /** Captured raw SQL — only present for callers whose role is allowed. */
  sql?: string
  /** `false` when the resource's adapter does not implement aggregateTimeSeries. */
  supported: boolean
  /** Populated when `groupByLabelResource` was set — maps series key → title. */
  resolvedLabels?: Record<string, string>
}

export type HistoryOp = 'create' | 'update' | 'delete'

export interface HistoryDiffEntry {
  path: string
  before?: unknown
  after?: unknown
  kind: 'added' | 'changed' | 'removed'
}

export interface HistoryRevision {
  id: string
  resourceId: string
  recordId: string
  op: HistoryOp
  userId?: string
  snapshot: Record<string, unknown>
  snapshotBefore?: Record<string, unknown>
  createdAt: string
}

export interface HistoryListResponse {
  revisions: HistoryRevision[]
}

export interface HistoryRevisionResponse {
  revision: HistoryRevision
}

export interface AuditLogEntry {
  /** UUID v7 assigned by the writer; optional for legacy in-memory rows. */
  id?: string
  resourceId: string
  action: string
  recordId?: string
  recordIds?: string[]
  /** Human-readable title of the affected record, stored at write time. */
  recordTitle?: string
  userId?: string
  payload?: Record<string, unknown>
  result?: Record<string, unknown>
  at: number
}

export interface AuditLogQuery {
  resourceId?: string
  recordId?: string
  userId?: string
  actions?: string[]
  from?: string
  to?: string
  limit?: number
  offset?: number
  /** Cursor: fetch only entries with `at` strictly before this unix-ms value. */
  before?: number
}

export interface AuditLogResponse {
  events: AuditLogEntry[]
}

/** Wire shape of an API key record exposed by `/admin/api/api-keys/*`. */
export interface ApiKeyRecord {
  id: string
  name: string | null
  start: string | null
  prefix: string | null
  enabled: boolean
  permissions: Record<string, string[]>
  expiresAt: string | null
  lastRequest: string | null
  createdAt: string
  updatedAt: string
}

export interface WebhookInput {
  name: string
  url: string
  events: string[]
  resourceId?: string | null
  enabled?: boolean
  secret?: string
  headers?: Record<string, string>
  filters?: Record<string, string>
  payloadFields?: string[]
}

export interface WebhookRecord extends Required<Omit<WebhookInput, 'secret'>> {
  id: string
  secret?: string
  createdAt: string
  updatedAt: string
}

export interface WebhookDeliveryRecord {
  id: string
  webhookId: string
  event: string
  payload: Record<string, unknown>
  status: 'pending' | 'success' | 'failed'
  responseStatus?: number
  responseBody?: string
  error?: string
  attempt: number
  createdAt: string
  deliveredAt?: string
}

export interface AiAssistantSettings {
  enabled: boolean
  configured: boolean
  provider: 'openrouter'
  model: string
  maskedApiKey: string | null
  systemPrompt: string
  canManage: boolean
  canChat: boolean
  readOnly: boolean
}

export interface AiAssistantChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Snapshot of the admin frontend at the moment the user sent the message,
 * passed alongside the chat payload so the assistant can ground itself.
 */
export interface AiClientContext {
  /** Current window pathname, e.g. "/" or "/resources/posts/abc". */
  pathname?: string
}

/** Allowed navigation targets — mirrors the safe subset of `Route`. */
export type AiNavigateRoute =
  | { name: 'home' }
  | { name: 'audit-log' }
  | { name: 'list'; resourceId: string }
  | { name: 'show'; resourceId: string; recordId: string }
  | { name: 'settings'; section?: string }

/** Side-effect emitted by the assistant for the frontend to execute. */
export type AiUiAction =
  | { kind: 'navigate'; route: AiNavigateRoute }
  | { kind: 'refresh'; target: 'dashboard' }

export interface AiAssistantCitation {
  resourceId: string
  recordId?: string
  label: string
}

export interface AiAssistantChatResponse {
  message: { role: 'assistant'; content: string }
  citations: AiAssistantCitation[]
  toolCalls: Array<{ toolName: string; state: string }>
  taskId?: string
}

export interface AiAssistantChatEnqueueResponse {
  taskId: string
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
}

export interface AiAssistantChatHistoryItem {
  conversationId: string
  taskId: string
  title: string
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  updatedAt: string
}

export interface AiAssistantTask {
  id: string
  kind: string
  resourceId?: string
  recordId?: string
  userId?: string
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  input: Record<string, unknown>
  output?: {
    text?: string
    citations?: AiAssistantCitation[]
    toolCalls?: Array<{ toolName: string }>
    uiActions?: AiUiAction[]
    [key: string]: unknown
  }
  error?: string
  progress: number | null
  createdAt: string
  updatedAt: string
  startedAt?: string
  finishedAt?: string
}

export interface AiFillResponse {
  /** Map of property path → extracted value. Only fields the model could
   *  confidently extract are present; the form merges them into existing
   *  values without clobbering unrelated columns. */
  values: Record<string, unknown>
}

/** Metadata returned by `POST /upload` for one file. */
export interface UploadedFileInfo {
  key: string
  url: string
  name: string
  size: number
  mimeType: string
}

/** Bytes-loaded snapshot emitted by `XMLHttpRequest.upload.onprogress`. */
export interface UploadProgress {
  loaded: number
  total: number
  /** 0–100, rounded. */
  percent: number
}

export interface UploadFileOptions {
  onProgress?: (p: UploadProgress) => void
  signal?: AbortSignal
}

export interface UploadFilesOptions {
  /** Maximum concurrent in-flight requests. Default 3. */
  concurrency?: number
  signal?: AbortSignal
  onItemStart?: (index: number, file: File) => void
  onItemProgress?: (index: number, file: File, p: UploadProgress) => void
  onItemComplete?: (index: number, file: File, info: UploadedFileInfo) => void
  onItemError?: (index: number, file: File, error: Error) => void
}

export interface GlobalSearchHit {
  resourceId: string
  resourceName: string
  recordId: string
  title: string
  /** Property path whose value matched the query (omitted when matched on title or id). */
  matchedField?: string
  /** ~80-char excerpt with the matched substring near its center. */
  snippet?: string
  /** Relevance ranking — higher is better. Mirrors the server-side rubric. */
  score?: number
}

export interface GlobalSearchGroup {
  resourceId: string
  resourceName: string
  records: GlobalSearchHit[]
}

export interface GlobalSearchResponse {
  query: string
  groups: GlobalSearchGroup[]
  total: number
}

export class AdminApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'AdminApiError'
  }
}

/** Extract a human-readable message from any error thrown by AdminClient.
 *  The raw message is the HTTP response body text (often JSON). We try to
 *  parse the `.message` field from the JSON payload before falling back. */
export function parseApiError(err: unknown): { status?: number; message: string } {
  if (err instanceof AdminApiError) {
    try {
      const body = JSON.parse(err.message) as { message?: string }
      return { status: err.status, message: body.message ?? err.message }
    } catch {
      return { status: err.status, message: err.message }
    }
  }
  return { message: err instanceof Error ? err.message : String(err) }
}
