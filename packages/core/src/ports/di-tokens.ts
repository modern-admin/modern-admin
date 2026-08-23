/**
 * Framework-instance token shared by transport integrations.
 *
 * The symbol intentionally keeps the historical registry key used by
 * `@modern-admin/nest`, so applications compiled against older releases and
 * transports compiled against this core-owned token resolve the same value.
 */
export const MODERN_ADMIN = Symbol.for('@modern-admin/nest:ModernAdmin')
