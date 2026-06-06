/**
 * Multipart parser for the GraphQL multipart request spec
 * (https://github.com/jaydenseric/graphql-multipart-request-spec).
 *
 * Wire format:
 *   - `operations` field — JSON `{ query, variables?, operationName? }`
 *   - `map`        field — JSON `{ "0": ["variables.file"], "1": ["variables.files.0"] }`
 *   - file parts named `"0"`, `"1"`, ... — one per file path in `map`.
 *
 * Each file is buffered in memory and substituted into `variables` at the
 * paths listed in the map. Resolvers receive an `UploadValue` (matching the
 * `Upload` scalar's runtime shape).
 *
 * Buffering instead of streaming keeps the parser simple and matches the REST
 * upload controller's semantics — admin uploads are bounded by the per-property
 * `maxSize`, not arbitrary multi-gigabyte streams.
 */

import type { IncomingMessage } from 'node:http'
import Busboy from 'busboy'
import type { UploadValue } from './scalars.js'

export interface MultipartGraphqlRequest {
  query: string
  variables: Record<string, unknown>
  operationName: string | null
}

interface ParsedField {
  name: string
  value: string
}

interface ParsedFile {
  name: string
  filename: string
  mimeType: string
  buffer: Buffer
}

const isMultipart = (req: IncomingMessage): boolean => {
  const ct = req.headers['content-type']
  return typeof ct === 'string' && /^multipart\/form-data/i.test(ct)
}

/**
 * Parse the request stream into a single GraphQL operation with file values
 * substituted into `variables`. Returns `null` when the request is not
 * multipart so the caller can fall back to JSON parsing.
 */
export async function parseMultipartGraphqlRequest(
  req: IncomingMessage,
): Promise<MultipartGraphqlRequest | null> {
  if (!isMultipart(req)) return null

  const { fields, files } = await new Promise<{ fields: ParsedField[]; files: ParsedFile[] }>(
    (resolve, reject) => {
      let bb: ReturnType<typeof Busboy>
      try {
        bb = Busboy({ headers: req.headers as Record<string, string> })
      } catch (err) {
        reject(err)
        return
      }
      const fields: ParsedField[] = []
      const files: ParsedFile[] = []
      let pending = 0
      let finished = false
      let settled = false
      let firstError: unknown
      const tryResolve = (): void => {
        if (settled || !finished || pending > 0) return
        settled = true
        if (firstError) reject(firstError)
        else resolve({ fields, files })
      }
      bb.on('field', (name, value) => {
        fields.push({ name, value })
      })
      bb.on('file', (name, stream, info) => {
        pending++
        const chunks: Buffer[] = []
        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('end', () => {
          files.push({
            name,
            filename: info.filename || 'upload',
            mimeType: info.mimeType || 'application/octet-stream',
            buffer: Buffer.concat(chunks),
          })
          pending--
          tryResolve()
        })
        stream.on('error', (err) => {
          firstError = firstError ?? err
          pending--
          tryResolve()
        })
      })
      bb.on('finish', () => {
        finished = true
        tryResolve()
      })
      bb.on('error', (err: unknown) => {
        firstError = firstError ?? err
        finished = true
        tryResolve()
      })
      req.pipe(bb)
    },
  )

  const operationsField = fields.find((f) => f.name === 'operations')
  const mapField = fields.find((f) => f.name === 'map')
  if (!operationsField) {
    throw new Error('multipart request is missing the "operations" field')
  }
  if (!mapField) {
    throw new Error('multipart request is missing the "map" field')
  }

  let operations: { query?: string; variables?: Record<string, unknown>; operationName?: string }
  try {
    operations = JSON.parse(operationsField.value)
  } catch {
    throw new Error('multipart "operations" field is not valid JSON')
  }
  let map: Record<string, string[]>
  try {
    map = JSON.parse(mapField.value)
  } catch {
    throw new Error('multipart "map" field is not valid JSON')
  }

  if (!operations.query || typeof operations.query !== 'string') {
    throw new Error('multipart "operations" must include a string "query" field')
  }

  const variables: Record<string, unknown> = { ...(operations.variables ?? {}) }

  // Substitute each file part into the variable paths it is mapped to.
  for (const [fileKey, paths] of Object.entries(map)) {
    const part = files.find((f) => f.name === fileKey)
    if (!part) {
      throw new Error(`multipart map references missing file part "${fileKey}"`)
    }
    const upload: UploadValue = {
      filename: part.filename,
      mimeType: part.mimeType,
      size: part.buffer.length,
      buffer: part.buffer,
    }
    for (const path of paths) {
      assignAtPath(variables, path, upload)
    }
  }

  return {
    query: operations.query,
    variables,
    operationName: operations.operationName ?? null,
  }
}

/**
 * Assign `value` at the dot/index path `path` inside `root`. Path segments
 * are split by `.` and the leading segment (`variables`) is stripped because
 * the spec scopes paths to the operations document — the local root is the
 * variables map itself.
 */
function assignAtPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.')
  if (segments[0] === 'variables') segments.shift()
  if (segments.length === 0) return
  let cursor: Record<string, unknown> | unknown[] = root
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!
    const next = (cursor as Record<string, unknown>)[seg]
    if (next == null || (typeof next !== 'object' && !Array.isArray(next))) {
      throw new Error(`multipart map path "${path}" does not resolve in variables`)
    }
    cursor = next as Record<string, unknown> | unknown[]
  }
  const last = segments[segments.length - 1]!
  if (Array.isArray(cursor)) {
    const idx = Number(last)
    if (!Number.isInteger(idx)) {
      throw new Error(`multipart map path "${path}" expected numeric index`)
    }
    cursor[idx] = value
  } else {
    cursor[last] = value
  }
}
