// Opt-out marker for `ModernAdminCacheInterceptor`.
//
// The interceptor caches every GET under `/admin/api/resources/:resourceId`
// whose resource has `cache.http` enabled (the default). That is right for
// the built-in read actions, whose responses are pure functions of the
// stored records and whose tags are invalidated by the matching mutations.
//
// It is wrong for the custom-action GET routes: their response is produced
// by user code that the framework cannot reason about (it may hit a third
// party, read a table we hold no tag for, or return a nonce for the form it
// primes). Marking those handlers makes the interceptor bypass them.

import { SetMetadata, type CustomDecorator } from '@nestjs/common'

export const NO_HTTP_CACHE = 'modern-admin:no-http-cache'

/** Exempt a controller handler (or a whole controller) from the admin's
 *  GET response cache. */
export const NoHttpCache = (): CustomDecorator<string> => SetMetadata(NO_HTTP_CACHE, true)
