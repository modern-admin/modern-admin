import { NotImplementedError } from '../errors'
import type { BaseResource } from './base-resource.js'

export abstract class BaseDatabase {

  constructor(_database: unknown) {}

  /**
   * Whether this adapter supports the given raw database handle. Subclasses
   * MUST override this. Returning `false` lets ResourcesFactory fall through
   * to the next registered adapter.
   */
  static isAdapterFor(_database: unknown): boolean {
    throw new NotImplementedError('BaseDatabase.isAdapterFor')
  }

  abstract resources(): BaseResource[]
}
