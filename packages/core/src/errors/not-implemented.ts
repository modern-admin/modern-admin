export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`Method "${method}" is not implemented`)
    this.name = 'NotImplementedError'
  }
}
