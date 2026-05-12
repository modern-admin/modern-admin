// DI tokens for the NestJS module. We avoid coupling to specific concrete
// classes so consumers can swap implementations through `forRoot()`.

export const MODERN_ADMIN = Symbol.for('@modern-admin/nest:ModernAdmin')
export const MODERN_ADMIN_OPTIONS = Symbol.for('@modern-admin/nest:Options')
/**
 * Optional DI token. When provided, exposes `IApiKeyService` to the
 * `ApiKeysController` so the Settings → API Keys UI can list/create/
 * update/revoke keys. The host app supplies it (see
 * `BetterAuthProvider.getApiKeyAdmin()`); when absent, the endpoints
 * respond with 501.
 */
export const MODERN_ADMIN_API_KEY_SERVICE = Symbol.for('@modern-admin/nest:ApiKeyService')
