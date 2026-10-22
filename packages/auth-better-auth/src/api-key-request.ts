/** The public plugin surface of a configured Better Auth instance. */
export interface BetterAuthApiKeySource {
  options?: { plugins?: readonly unknown[] }
  $context?: Promise<unknown>
}

/**
 * Ask the api-key plugin's own matchers whether it will authenticate this
 * request. Its header lists and custom getter live in the matchers' closures,
 * not in the plugin's public options. Repeating those settings in the host
 * would let a configuration mismatch turn a key into an unrestricted session.
 * Matchers only extract credentials; they do not verify keys or consume quota.
 */
export async function isBetterAuthApiKeyRequest(
  auth: BetterAuthApiKeySource,
  headers: Headers,
  path = '/get-session',
  method = 'GET',
): Promise<boolean> {
  for (const plugin of auth.options?.plugins ?? []) {
    const candidate = plugin as {
      id?: string
      hooks?: { before?: Array<{ matcher?: (ctx: unknown) => unknown }> }
    }
    if (candidate?.id !== 'api-key') continue
    const hooks = candidate.hooks?.before
    // An incompatible plugin must fail closed rather than silently skip detection.
    if (!hooks?.length) throw new Error('API_KEY_DETECTION_FAILED')
    const context = await auth.$context
    for (const hook of hooks) {
      if (typeof hook.matcher !== 'function') throw new Error('API_KEY_DETECTION_FAILED')
      if (await hook.matcher({ headers, context, path, method })) return true
    }
  }
  return false
}
