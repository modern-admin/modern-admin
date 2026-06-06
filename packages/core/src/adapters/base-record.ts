import { ValidationError, type PropertyErrors, type RecordError } from '../errors'
import { flatten, get, set, selectParams, merge, unflatten } from '../utils/flat.js'
import type { ParamsType, RecordJSON } from './types.js'
import type { BaseResource } from './base-resource.js'

export class BaseRecord {
  public params: ParamsType
  public errors: PropertyErrors = {}
  public baseError: RecordError | null = null
  public populated: Record<string, BaseRecord> = {}

  constructor(
    params: ParamsType | undefined,
    public readonly resource: BaseResource,
  ) {
    this.params = params ? flatten(params) : {}
  }

  /** Read a flat or nested value by dotted path. */
  get(path?: string): unknown {
    return get(this.params, path)
  }

  /** Replace a value at the given path; nested values are flattened. */
  set(path: string, value: unknown): ParamsType {
    this.params = set(this.params, path, value)
    return this.params
  }

  /** Returns flat params whose keys start with `prefix` (or the prefix itself). */
  selectParams(prefix: string): ParamsType | undefined {
    return selectParams(this.params, prefix)
  }

  /** Merge incoming payload data into the flat params store. */
  storeParams(payload?: ParamsType): void {
    this.params = merge(this.params, payload ? flatten(payload) : undefined)
  }

  id(): string {
    const idProp = this.resource.properties().find((p) => p.isId())
    if (!idProp) {
      throw new Error(`Resource "${this.resource.id()}" has no id property`)
    }
    const value = this.params[idProp.name()]
    return value == null ? '' : String(value)
  }

  title(): string {
    const path = this.resource.titlePropertyPath()
    if (!path) return this.id()
    const value = this.params[path]
    return value == null ? this.id() : String(value)
  }

  populate(path: string, record: BaseRecord | null): void {
    if (record == null) {
      const { [path]: _omit, ...rest } = this.populated
      this.populated = rest
    } else {
      this.populated[path] = record
    }
  }

  isValid(): boolean {
    return Object.keys(this.errors).length === 0 && this.baseError === null
  }

  error(path: string): RecordError | undefined {
    return this.errors[path]
  }

  async save(): Promise<this> {
    try {
      const id = this.id()
      const next = id
        ? await this.resource.update(id, this.params)
        : await this.resource.create(this.params)
      this.storeParams(next)
      this.errors = {}
      this.baseError = null
    } catch (err) {
      if (err instanceof ValidationError) {
        this.errors = err.propertyErrors
        this.baseError = err.baseError
        return this
      }
      throw err
    }
    return this
  }

  async update(payload: ParamsType): Promise<this> {
    try {
      this.storeParams(payload)
      const next = await this.resource.update(this.id(), payload)
      this.storeParams(next)
      this.errors = {}
      this.baseError = null
    } catch (err) {
      if (err instanceof ValidationError) {
        this.errors = err.propertyErrors
        this.baseError = err.baseError
        return this
      }
      throw err
    }
    return this
  }

  toJSON(): RecordJSON {
    const populated: Record<string, RecordJSON | unknown> = {}
    for (const key of Object.keys(this.populated)) {
      const child = this.populated[key]
      populated[key] = child instanceof BaseRecord ? child.toJSON() : toJsonSafe(child)
    }
    // Wire shape ships nested params (arrays/objects rebuilt) so clients
    // don't have to reverse the flat dot-notation. The internal `this.params`
    // stays flat for path-based mutators.
    return {
      id: this.id(),
      title: this.title(),
      params: toJsonSafe(unflatten(this.params)) as ParamsType,
      populated,
      errors: this.errors,
      baseError: this.baseError,
    }
  }
}

/**
 * Recursively normalize a value so it survives `JSON.stringify`. The only
 * non-JSON-safe primitive that adapters routinely surface is `BigInt`
 * (Prisma's `BigInt` columns, Drizzle's `bigint mode: 'bigint'`); we render
 * those as decimal strings. Without this, both Express's response writer
 * and any cache provider (`@modern-admin/cache-redis`) crash with
 * `TypeError: JSON.stringify cannot serialize BigInt` the moment a record
 * carrying a `BigInt` field lands on the wire.
 *
 * The conversion is lossy in JS-type terms but JSON has no native BigInt
 * representation anyway — strings are the canonical interchange shape.
 */
const toJsonSafe = (value: unknown): unknown => {
  if (typeof value === 'bigint') return value.toString()
  if (value == null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(toJsonSafe)
  // Honour custom toJSON (Date, Decimal.js, Mongo ObjectId, Day.js, …) —
  // these already produce JSON-safe values, so we delegate.
  if (typeof (value as { toJSON?: unknown }).toJSON === 'function') return value
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(value as Record<string, unknown>)) {
    out[k] = toJsonSafe((value as Record<string, unknown>)[k])
  }
  return out
}
