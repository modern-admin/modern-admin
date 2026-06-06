// @modern-admin/realtime — WebSocket gateway and pub/sub buses for live
// resource events. Pair `ModernAdminRealtimeModule.forRoot({ bus })` with
// `ModernAdminModule.forRoot({ realtime: bus })` to broadcast every
// create/update/delete to connected clients.

export { ModernAdminRealtimeModule, type ModernAdminRealtimeModuleOptions } from './module.js'
export { RealtimeGateway } from './gateway.js'
export { RedisRealtimeBus, type RealtimeRedisLike, type RedisRealtimeBusOptions } from './redis-bus.js'
export { REALTIME_BUS, REALTIME_EVENT } from './tokens.js'
