// DI tokens for the NestJS module. The framework-instance token is owned by
// core so sibling transports can inject the same instance without depending
// on this REST transport package.

export { MODERN_ADMIN } from '@modern-admin/core'
export const MODERN_ADMIN_OPTIONS = Symbol.for('@modern-admin/nest:Options')
/**
 * Optional DI token. When provided, exposes `IApiKeyService` to the
 * `ApiKeysController` so the Settings → API Keys UI can list/create/
 * update/revoke keys. The host app supplies it (see
 * `BetterAuthProvider.getApiKeyAdmin()`); when absent, the endpoints
 * respond with 501.
 */
export const MODERN_ADMIN_API_KEY_SERVICE = Symbol.for('@modern-admin/nest:ApiKeyService')
