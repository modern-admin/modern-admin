/** Framework logging port. Hosts can bridge this to Nest, Pino, Winston, or
 * any structured logger without making core depend on a logging library. */
export interface ILogger {
  debug(message: string, context?: Record<string, unknown>): void
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, context?: Record<string, unknown>): void
}

/** Console-backed default used when a host does not provide a logger. */
export class ConsoleLogger implements ILogger {
  debug(message: string, context?: Record<string, unknown>): void {
    if (context) console.debug(message, context)
    else console.debug(message)
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (context) console.info(message, context)
    else console.info(message)
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (context) console.warn(message, context)
    else console.warn(message)
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (context) console.error(message, context)
    else console.error(message)
  }
}
