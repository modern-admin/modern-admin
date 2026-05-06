export class NoDatabaseAdapterError extends Error {
  constructor(public readonly database: unknown) {
    super('No registered adapter supports the provided database instance')
    this.name = 'NoDatabaseAdapterError'
  }
}

export class NoResourceAdapterError extends Error {
  constructor(public readonly resource: unknown) {
    super('No registered adapter supports the provided resource')
    this.name = 'NoResourceAdapterError'
  }
}

export class ResourceNotFoundError extends Error {
  constructor(resourceId: string) {
    super(`Resource "${resourceId}" was not found`)
    this.name = 'ResourceNotFoundError'
  }
}

export class ActionNotFoundError extends Error {
  constructor(actionName: string, resourceId: string) {
    super(`Action "${actionName}" was not found on resource "${resourceId}"`)
    this.name = 'ActionNotFoundError'
  }
}

export class RecordNotFoundError extends Error {
  constructor(recordId: string, resourceId: string) {
    super(`Record "${recordId}" was not found in resource "${resourceId}"`)
    this.name = 'RecordNotFoundError'
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Access denied') {
    super(message)
    this.name = 'ForbiddenError'
  }
}
