import { describe, expect, test } from 'bun:test'
import {
  isCredentialAccountIdentity,
  planAccountIdentityMigration,
  resolveAccountIssuer,
} from '../src/account-identities.js'

describe('Better Auth 1.7 account identities', () => {
  test('resolves credential, authoritative Google, and issuer-less GitHub identities', () => {
    expect(resolveAccountIssuer('credential')).toBe('local:credential')
    expect(resolveAccountIssuer('google')).toBe('https://accounts.google.com')
    expect(resolveAccountIssuer('github')).toBe('local:oauth:github')
  })

  test('percent-encodes only explicitly approved issuer-less OAuth providers', () => {
    expect(
      resolveAccountIssuer('custom/provider', {
        issuerlessOAuthProviders: ['custom/provider'],
      }),
    ).toBe('local:oauth:custom%2Fprovider')
  })

  test('rejects unknown providers without mutating the input', () => {
    const accounts = [
      { id: 'a-1', providerId: 'unknown', accountId: 'subject', userId: 'u-1' },
    ] as const
    expect(() => planAccountIdentityMigration(accounts)).toThrow(/Unknown.*unknown/)
    expect(accounts[0]).not.toHaveProperty('issuer')
  })

  test('rejects credential rows not bound to the linked stable user id', () => {
    expect(() =>
      planAccountIdentityMigration([
        { id: 'a-1', providerId: 'credential', accountId: 'other', userId: 'u-1' },
      ]),
    ).toThrow(/accountId must equal.*userId/)
  })

  test('rejects projected identity collisions without returning a partial plan', () => {
    expect(() =>
      planAccountIdentityMigration([
        { id: 'a-1', providerId: 'google', accountId: 'subject', userId: 'u-1' },
        { id: 'a-2', providerId: 'google', accountId: 'subject', userId: 'u-2' },
      ]),
    ).toThrow(/Duplicate.*a-1, a-2/)
  })

  test('validates the complete credential tuple', () => {
    const valid = {
      providerId: 'credential',
      issuer: 'local:credential',
      accountId: 'u-1',
    }
    expect(isCredentialAccountIdentity(valid, 'u-1')).toBe(true)
    expect(isCredentialAccountIdentity({ ...valid, providerId: 'google' }, 'u-1')).toBe(false)
    expect(isCredentialAccountIdentity({ ...valid, issuer: 'local:oauth:credential' }, 'u-1')).toBe(false)
    expect(isCredentialAccountIdentity({ ...valid, accountId: 'u-2' }, 'u-1')).toBe(false)
  })
})
