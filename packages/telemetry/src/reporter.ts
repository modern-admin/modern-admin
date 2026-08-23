import type { ModernAdmin } from '@modern-admin/core'
import { collectTelemetryInfo } from './collect.js'
import { reportTelemetry } from './report.js'

/** Adapter for `ModernAdminModuleOptions.telemetry`. */
export function reportModernAdminTelemetry(admin: ModernAdmin): Promise<void> {
  return reportTelemetry(collectTelemetryInfo(admin))
}
