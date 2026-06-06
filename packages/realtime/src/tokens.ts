/** DI token for the IRealtimeBus instance shared across modules. */
export const REALTIME_BUS = Symbol.for('@modern-admin/realtime:Bus')

/** WebSocket event name used when broadcasting realtime events to clients. */
export const REALTIME_EVENT = 'modernAdmin:realtime'
