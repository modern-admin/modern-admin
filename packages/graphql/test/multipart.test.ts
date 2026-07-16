import { describe, it, expect } from 'bun:test'
import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { parseMultipartGraphqlRequest } from '../src/multipart.js'

const BOUNDARY = 'testboundary123'

/** Build a minimal graphql-multipart-spec request body with a single file. */
function buildRequest(fileBytes: Buffer): IncomingMessage {
  const parts: Buffer[] = []
  const push = (s: string): void => {
    parts.push(Buffer.from(s, 'utf8'))
  }
  push(`--${BOUNDARY}\r\n`)
  push('Content-Disposition: form-data; name="operations"\r\n\r\n')
  push(JSON.stringify({ query: 'mutation($f: Upload!){ adminUpload(file:$f){key} }', variables: { f: null } }))
  push('\r\n')
  push(`--${BOUNDARY}\r\n`)
  push('Content-Disposition: form-data; name="map"\r\n\r\n')
  push(JSON.stringify({ '0': ['variables.f'] }))
  push('\r\n')
  push(`--${BOUNDARY}\r\n`)
  push('Content-Disposition: form-data; name="0"; filename="blob.bin"\r\n')
  push('Content-Type: application/octet-stream\r\n\r\n')
  parts.push(fileBytes)
  push('\r\n')
  push(`--${BOUNDARY}--\r\n`)

  const body = Buffer.concat(parts)
  const stream = Readable.from(body) as unknown as IncomingMessage
  stream.headers = {
    'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
    'content-length': String(body.length),
  } as IncomingMessage['headers']
  return stream
}

describe('parseMultipartGraphqlRequest limits', () => {
  it('parses a within-limit file into variables', async () => {
    const result = await parseMultipartGraphqlRequest(buildRequest(Buffer.alloc(64, 1)), {
      maxFileSize: 1024,
    })
    expect(result).not.toBeNull()
    const file = result!.variables.f as { size: number; buffer: Buffer }
    expect(file.size).toBe(64)
  })

  it('rejects a file that exceeds maxFileSize', async () => {
    await expect(
      parseMultipartGraphqlRequest(buildRequest(Buffer.alloc(2048, 1)), { maxFileSize: 512 }),
    ).rejects.toThrow(/maximum size/)
  })

  it('returns null for a non-multipart request', async () => {
    const stream = Readable.from(Buffer.from('{}')) as unknown as IncomingMessage
    stream.headers = { 'content-type': 'application/json' } as IncomingMessage['headers']
    expect(await parseMultipartGraphqlRequest(stream)).toBeNull()
  })
})
