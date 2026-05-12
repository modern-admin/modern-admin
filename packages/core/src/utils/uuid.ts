/**
 * UUID v7 (RFC 9562) generator.
 *
 * UUID v7 is time-ordered: the first 48 bits encode a Unix-ms timestamp,
 * followed by version + random bits. This keeps inserts cache- and
 * index-friendly and yields naturally sortable identifiers — ideal for
 * primary keys, log entry ids, queue job ids, etc.
 *
 * The project-wide rule (see `CLAUDE.md` → "Identifier policy") is to use
 * this function for **all** generated identifiers. Never use
 * `crypto.randomUUID()` (which produces v4) or third-party libraries.
 *
 * Layout (16 bytes):
 *
 *   0..5   unix_ts_ms        (big-endian)
 *   6      version=7 (high nibble) | rand (low nibble)
 *   7      rand
 *   8      variant=10 (top 2 bits) | rand
 *   9..15  rand
 */
export function uuidv7(): string {
  const ms = Date.now()
  const random = globalThis.crypto.getRandomValues(new Uint8Array(10))
  const bytes = new Uint8Array(16)
  // Unix-ms timestamp (48 bits, big-endian).
  // Date.now() fits comfortably in 48 bits until year ~10889.
  bytes[0] = (ms / 0x10000000000) & 0xff
  bytes[1] = (ms / 0x100000000) & 0xff
  bytes[2] = (ms >>> 24) & 0xff
  bytes[3] = (ms >>> 16) & 0xff
  bytes[4] = (ms >>> 8) & 0xff
  bytes[5] = ms & 0xff
  // Random bits.
  bytes.set(random, 6)
  // Version 7 in high nibble of byte 6.
  bytes[6] = (bytes[6]! & 0x0f) | 0x70
  // Variant 10 in top 2 bits of byte 8.
  bytes[8] = (bytes[8]! & 0x3f) | 0x80

  const hex: string[] = []
  for (let i = 0; i < 16; i++) hex.push(bytes[i]!.toString(16).padStart(2, '0'))
  const s = hex.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}
