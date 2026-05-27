// Tiny in-memory audit-log used by demo controllers to showcase NestJS
// dependency injection inside admin controller methods. A real app would
// persist entries to a table or stream them to a SIEM.

import { Injectable } from '@nestjs/common'

export interface AuditEntry {
  at: Date
  actor: string
  resourceId: string
  action: string
  recordId?: string
  recordIds?: string[]
  details?: Record<string, unknown>
}

@Injectable()
export class AuditLogService {
  private readonly entries: AuditEntry[] = []

  record(entry: Omit<AuditEntry, 'at'>): void {
    this.entries.push({ ...entry, at: new Date() })

    console.log(
      '[audit]',
      entry.actor,
      entry.action,
      entry.resourceId,
      entry.recordId ?? entry.recordIds ?? '-',
    )
  }

  list(): readonly AuditEntry[] {
    return this.entries
  }
}
