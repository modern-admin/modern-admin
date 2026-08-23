/** Better Auth 1.7's complete local email/password account identity. */
export const CREDENTIAL_ACCOUNT_IDENTITY = {
  providerId: 'credential',
  issuer: 'local:credential',
} as const

/** Authoritative issuers verified by the providers enabled in the scaffold. */
export const BUILTIN_AUTHORITATIVE_ACCOUNT_ISSUERS = {
  google: 'https://accounts.google.com',
} as const

/**
 * Built-in OAuth providers enabled by the scaffold that Better Auth 1.7 does
 * not bind to an authoritative account issuer.
 */
export const BUILTIN_ISSUERLESS_OAUTH_PROVIDERS = ['github'] as const

export interface AccountIdentityInput {
  id: string
  providerId: string
  accountId: string
  userId: string
  issuer?: string | null
}

export interface AccountIssuerPolicy {
  /** Provider ids mapped to an issuer verified by that provider. */
  authoritativeIssuers?: Readonly<Record<string, string>>
  /** OAuth provider ids confirmed to have no authoritative issuer. */
  issuerlessOAuthProviders?: readonly string[]
}

export interface PlannedAccountIdentity extends AccountIdentityInput {
  issuer: string
}

/** Validate all three predicates Better Auth 1.7 uses for credentials. */
export const isCredentialAccountIdentity = (
  account: Pick<AccountIdentityInput, 'providerId' | 'issuer' | 'accountId'>,
  userId: string,
): boolean =>
  account.providerId === CREDENTIAL_ACCOUNT_IDENTITY.providerId &&
  account.issuer === CREDENTIAL_ACCOUNT_IDENTITY.issuer &&
  account.accountId === userId

/** Resolve one legacy provider to a trusted Better Auth 1.7 issuer. */
export const resolveAccountIssuer = (
  providerId: string,
  policy: AccountIssuerPolicy = {},
): string => {
  if (providerId === CREDENTIAL_ACCOUNT_IDENTITY.providerId) {
    return CREDENTIAL_ACCOUNT_IDENTITY.issuer
  }

  const authoritativeIssuers: Record<string, string> = {
    ...BUILTIN_AUTHORITATIVE_ACCOUNT_ISSUERS,
    ...policy.authoritativeIssuers,
  }
  const authoritativeIssuer = authoritativeIssuers[providerId]
  if (authoritativeIssuer) return authoritativeIssuer

  const issuerlessProviders = new Set<string>([
    ...BUILTIN_ISSUERLESS_OAUTH_PROVIDERS,
    ...(policy.issuerlessOAuthProviders ?? []),
  ])
  if (issuerlessProviders.has(providerId)) {
    return `local:oauth:${encodeURIComponent(providerId)}`
  }

  throw new Error(
    `Unknown Better Auth account provider "${providerId}". ` +
      'Verify its authoritative issuer (or explicitly confirm it has none) before migrating.',
  )
}

/**
 * Plan a fail-closed Better Auth 1.6 -> 1.7 issuer backfill.
 *
 * The input is never mutated. Unknown providers, malformed credential rows,
 * and projected `(issuer, accountId)` collisions throw before a plan is
 * returned, so callers can run the resulting writes in one transaction.
 */
export const planAccountIdentityMigration = (
  accounts: readonly AccountIdentityInput[],
  policy: AccountIssuerPolicy = {},
): PlannedAccountIdentity[] => {
  const planned = accounts.map((account): PlannedAccountIdentity => {
    const issuer = resolveAccountIssuer(account.providerId, policy)
    if (
      account.providerId === CREDENTIAL_ACCOUNT_IDENTITY.providerId &&
      account.accountId !== account.userId
    ) {
      throw new Error(
        `Credential account "${account.id}" is malformed: accountId must equal its linked userId.`,
      )
    }
    return { ...account, issuer }
  })

  const rowsByIdentity = new Map<string, PlannedAccountIdentity[]>()
  for (const account of planned) {
    const key = JSON.stringify([account.issuer, account.accountId])
    const rows = rowsByIdentity.get(key) ?? []
    rows.push(account)
    rowsByIdentity.set(key, rows)
  }

  const collisions = [...rowsByIdentity.values()].filter((rows) => rows.length > 1)
  if (collisions.length > 0) {
    const details = collisions
      .map(
        (rows) =>
          `(${rows[0]!.issuer}, ${rows[0]!.accountId}) rows [${rows.map(({ id }) => id).join(', ')}]`,
      )
      .join('; ')
    throw new Error(
      `Duplicate Better Auth (issuer, accountId) identities: ${details}. ` +
        'Resolve ownership manually; accounts and users were not merged or deleted.',
    )
  }

  return planned
}
