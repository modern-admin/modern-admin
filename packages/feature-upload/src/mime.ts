/**
 * Server-side MIME allow-list matching.
 *
 * `UploadPropertyConfig.mimeTypes` uses the same syntax as the HTML `accept`
 * attribute — exact types (`image/jpeg`), type wildcards (`image/*`), or the
 * catch-all wildcard (`*`, or its explicit `type`/`subtype` form). The
 * frontend enforces it for UX; the server
 * re-checks it so a hand-crafted request cannot store a disallowed type.
 *
 * Note: the matched MIME is the *declared* `Content-Type` from the multipart
 * part, which a client can spoof. This is defense-in-depth (it stops the
 * trivial "bypass the frontend accept filter" attack and pairs with the size
 * limits), not content sniffing — magic-byte inspection would need a decoder
 * per format and is intentionally out of scope here.
 */

/** Normalise a raw MIME to `type/subtype`, lower-cased, without parameters. */
function normalizeType(raw: string): string {
  return raw.split(';')[0]!.trim().toLowerCase()
}

/**
 * True when `type` matches at least one pattern in `patterns`. An empty or
 * omitted pattern list allows everything (no restriction configured).
 */
export function mimeMatches(type: string, patterns: readonly string[] | null | undefined): boolean {
  if (!patterns || patterns.length === 0) return true
  const t = normalizeType(type)
  if (!t) return false
  const [tMain, tSub] = t.split('/')
  for (const raw of patterns) {
    const p = normalizeType(raw)
    if (p === '*' || p === '*/*') return true
    const [pMain, pSub] = p.split('/')
    if (pSub === '*') {
      if (pMain === tMain) return true
    } else if (pMain === tMain && pSub === tSub) {
      return true
    }
  }
  return false
}
