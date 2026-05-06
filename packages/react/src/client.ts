// Tiny `fetch` wrapper aimed at the @modern-admin/nest REST surface. We avoid
// pulling axios — the host browser already has fetch, and TanStack Query gives
// us retry/dedup/caching anyway.

import type { AdminConfig, ListQuery, ListResponse, RecordResponse } from './types.js'

export interface AdminClientOptions {
  /** Absolute base URL of the API, e.g. http://localhost:3001 — defaults to same-origin. */
  baseUrl?: string
  /** Send credentials with every request (cookies for Better Auth sessions). */
  credentials?: RequestCredentials
  /** Optional global headers (auth tokens, CSRF). */
  headers?: Record<string, string>
}

const buildQuery = (query?: ListQuery): string => {
  if (!query) return ''
  const params = new URLSearchParams()
  if (query.page != null) params.set('page', String(query.page))
  if (query.perPage != null) params.set('perPage', String(query.perPage))
  if (query.sortBy) params.set('sortBy', query.sortBy)
  if (query.direction) params.set('direction', query.direction)
  if (query.filters) {
    for (const [k, v] of Object.entries(query.filters)) {
      if (v !== '' && v != null) params.set(`filters.${k}`, v)
    }
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export class AdminClient {
  private readonly baseUrl: string
  private readonly credentials: RequestCredentials
  private readonly headers: Record<string, string>

  constructor(opts: AdminClientOptions = {}) {
    this.baseUrl = opts.baseUrl?.replace(/\/$/, '') ?? ''
    this.credentials = opts.credentials ?? 'include'
    this.headers = opts.headers ?? {}
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
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

  config(): Promise<AdminConfig> {
    return this.request<AdminConfig>('/admin/api/config')
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
}

export class AdminApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'AdminApiError'
  }
}
