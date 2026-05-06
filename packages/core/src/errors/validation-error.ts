import type { RecordError } from './record-error.js'

export type PropertyErrors = Record<string, RecordError>

export class ValidationError extends Error {
  public readonly propertyErrors: PropertyErrors
  public readonly baseError: RecordError | null

  constructor(propertyErrors: PropertyErrors, baseError: RecordError | null = null) {
    super(baseError?.message ?? 'Validation failed')
    this.name = 'ValidationError'
    this.propertyErrors = propertyErrors
    this.baseError = baseError
  }
}
