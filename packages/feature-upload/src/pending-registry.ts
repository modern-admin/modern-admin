/**
 * PendingUploadsRegistry — tracks files that were uploaded to storage but have
 * not yet been "confirmed" by saving the parent record.
 *
 * Why
 * ---
 * Uploads happen *before* the form is submitted (the user picks a file, the
 * editor calls `POST /upload`, gets back a key, stores it in form state). If
 * the user then abandons the form (closes the tab, navigates away, server
 * rejects the create payload, etc.), the file ends up orphaned in storage.
 *
 * How
 * ---
 * - The controller calls `track(key, providerId, ttlMs)` after every successful
 *   upload, recording an expiry timestamp.
 * - The action hooks installed by `uploadFeature` call `confirm(keys)` from
 *   `new.after` / `edit.after` once the record is saved, removing the keys
 *   from the pending set so they will not be swept.
 * - The user-initiated `DELETE /upload?…` endpoint calls `cancel(key)` to
 *   immediately remove the file from storage when the user removes a freshly
 *   uploaded file *before* saving.
 * - A periodic sweeper started by `ModernAdminUploadModule.forRoot()` calls
 *   `sweep()` to delete files whose pending entry has expired. This handles
 *   abandoned forms, browser crashes, and any other path that bypasses
 *   client-side cleanup.
 *
 * The registry is a process-level singleton (same pattern as
 * `UploadProviderRegistry`).
 *
 * TODO(roadmap): swap the in-process `Map` for a Redis-backed store and move
 * the sweeper driver (`UploadSweeperService`) onto BullMQ. This is required
 * for multi-instance deployments where one Nest replica serves the upload
 * request and a different replica processes the form submission — without a
 * shared store the second replica would not see the pending entry, the
 * confirm hook would no-op, and the file would be swept on the originator.
 * BullMQ also gives us crash-safe scheduling and retries.
 */

import { UploadProviderRegistry } from './registry.js'

interface PendingEntry {
  /** Provider id used to look up the upload provider for `delete()`. */
  providerId: string
  /** Epoch ms after which the entry is eligible for sweep. */
  expiresAt: number
}

const _pending = new Map<string, PendingEntry>()

export const PendingUploadsRegistry = {
  /** Mark `key` as a freshly-uploaded, unconfirmed file. */
  track(key: string, providerId: string, ttlMs: number): void {
    _pending.set(key, { providerId, expiresAt: Date.now() + ttlMs })
  },

  /** Whether `key` is currently in the pending set (helper for tests / cancel). */
  has(key: string): boolean {
    return _pending.has(key)
  },

  /** Confirm one or more keys — they leave pending without being deleted. */
  confirm(keys: ReadonlyArray<string>): void {
    for (const k of keys) _pending.delete(k)
  },

  /**
   * Cancel a single pending key — deletes the file from storage and removes
   * the entry. No-op if the key is not pending (already confirmed or unknown).
   */
  async cancel(key: string): Promise<boolean> {
    const entry = _pending.get(key)
    if (!entry) return false
    _pending.delete(key)
    const cfg = UploadProviderRegistry.get(entry.providerId)
    if (!cfg) return false
    try {
      await cfg.provider.delete(key)
    } catch {
      // Non-fatal — best-effort cleanup.
    }
    return true
  },

  /**
   * Sweep expired entries — delete each from storage and from the registry.
   * Returns the number of files swept.
   */
  async sweep(now: number = Date.now()): Promise<number> {
    let swept = 0
    for (const [key, entry] of _pending) {
      if (entry.expiresAt <= now) {
        _pending.delete(key)
        const cfg = UploadProviderRegistry.get(entry.providerId)
        if (!cfg) continue
        try {
          await cfg.provider.delete(key)
          swept++
        } catch {
          // Non-fatal.
        }
      }
    }
    return swept
  },

  /** For test cleanup. */
  clear(): void {
    _pending.clear()
  },

  /** Number of currently-pending entries (for tests / introspection). */
  size(): number {
    return _pending.size
  },
}
