/**
 * Identity object representing the currently logged-in admin. Auth providers
 * fill the well-known fields and may attach arbitrary claims.
 */
export interface CurrentAdmin {
  id: string
  email?: string
  role?: string
  name?: string
  avatarUrl?: string
  /** Provider-specific claims, free-form. */
  [claim: string]: unknown
}
