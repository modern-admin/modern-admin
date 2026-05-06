// DI tokens for the NestJS module. We avoid coupling to specific concrete
// classes so consumers can swap implementations through `forRoot()`.

export const MODERN_ADMIN = Symbol.for('@modern-admin/nest:ModernAdmin')
export const MODERN_ADMIN_OPTIONS = Symbol.for('@modern-admin/nest:Options')
