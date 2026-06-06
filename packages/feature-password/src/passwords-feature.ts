/**
 * `passwordsFeature` — resource plugin that adds password hashing.
 *
 * Returns a `FeatureFn` that, when applied to a resource's `ResourceOptions`:
 *
 *  1. Hides the encrypted DB column from every view (it never reaches the
 *     UI as plaintext or hashed value).
 *  2. Surfaces a virtual form-only field (e.g. `newPassword`) that renders
 *     as a `password` input in the edit/new screens.
 *  3. Installs `before` hooks on `new` and `edit` that hash the virtual
 *     value, write it to the encrypted column, and strip the virtual field
 *     from the payload so the adapter never sees it.
 *
 * On `edit`, an empty virtual value is treated as "don't change" — the
 * encrypted column is left untouched. On `new`, an empty value is also
 * stripped (the resource's own required-validation kicks in if applicable).
 *
 * Hooks are **chained**, not replaced: existing `before` hooks on
 * `new`/`edit` continue to run.
 *
 * @example
 * import { passwordsFeature } from '@modern-admin/feature-password'
 * import argon2 from 'argon2'
 *
 * const usersResource: ResourceWithOptions = {
 *   resource: UsersTable,
 *   features: [
 *     passwordsFeature({
 *       properties: {
 *         encryptedPassword: 'password',
 *         password: 'newPassword',
 *       },
 *       hash: argon2.hash,
 *     }),
 *   ],
 * }
 */

import type {
  ActionRequest,
  ActionContext,
  Before,
  FeatureFn,
  ResourceOptions,
} from '@modern-admin/core'
import type { PasswordsFeatureOptions } from './types.js'

/** Normalise a `before` hook value (fn | fn[] | undefined) into an array. */
function toArray(hook: unknown): Before[] {
  if (!hook) return []
  return Array.isArray(hook) ? (hook as Before[]) : [hook as Before]
}

export function passwordsFeature(options: PasswordsFeatureOptions): FeatureFn {
  const encryptedPath = options.properties.encryptedPassword
  const virtualPath = options.properties.password
  const { hash } = options

  const beforeHook: Before = async (
    request: ActionRequest,
    _context: ActionContext,
  ): Promise<ActionRequest> => {
    const payload = request.payload ?? {}
    const raw = payload[virtualPath]
    const plain = typeof raw === 'string' ? raw : ''

    // Strip the virtual field from the payload regardless — the adapter
    // must never see it (the DB column doesn't exist).
    const next: Record<string, unknown> = { ...payload }
    delete next[virtualPath]

    if (plain.length > 0) {
      next[encryptedPath] = await hash(plain)
    } else {
      // Empty value on edit: leave the existing hash untouched.
      // Empty value on new: same — let validation handle missing required.
      delete next[encryptedPath]
    }

    return { ...request, payload: next }
  }

  return (resourceOptions: ResourceOptions): ResourceOptions => {
    // --- Property overrides ---
    const existingProps = resourceOptions.properties ?? {}

    // Encrypted column: hidden everywhere. Hash values must never reach the UI.
    const encryptedOverride = {
      ...(existingProps[encryptedPath] ?? {}),
      isVisible: { list: false, show: false, edit: false, filter: false },
    }

    // Virtual form input: visible only in edit/new, rendered as a password input.
    // (`isVisible.edit` covers both edit and new screens.)
    const virtualOverride = {
      ...(existingProps[virtualPath] ?? {}),
      type: 'password' as const,
      isVisible: { list: false, show: false, edit: true, filter: false },
    }

    // --- Action hooks ---
    const existingActions = resourceOptions.actions as
      | Record<string, Record<string, unknown>>
      | undefined
    const existingNew = existingActions?.new
    const existingEdit = existingActions?.edit

    const actionOverrides = {
      new: {
        ...existingNew,
        before: [...toArray(existingNew?.before), beforeHook],
      },
      edit: {
        ...existingEdit,
        before: [...toArray(existingEdit?.before), beforeHook],
      },
    } as ResourceOptions['actions']

    return {
      ...resourceOptions,
      properties: {
        ...existingProps,
        [encryptedPath]: encryptedOverride,
        [virtualPath]: virtualOverride,
      },
      actions: {
        ...(resourceOptions.actions ?? {}),
        ...actionOverrides,
      },
    }
  }
}
