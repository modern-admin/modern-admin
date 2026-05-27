/**
 * Custom scalars for the dynamic admin schema.
 *
 * `Upload` follows the GraphQL multipart request spec
 * (https://github.com/jaydenseric/graphql-multipart-request-spec). It cannot
 * be parsed from a literal AST or a JSON variable — it is injected into the
 * variables object by the multipart-aware controller before the operation is
 * executed.  Resolvers receive an `UploadValue` (filename + buffer + size +
 * mimeType) and can hand it directly to an upload provider.
 */

import { GraphQLScalarType, GraphQLError } from 'graphql'

/** Server-side runtime shape of the `Upload` scalar. */
export interface UploadValue {
  filename: string
  mimeType: string
  size: number
  buffer: Buffer
}

const isUploadValue = (v: unknown): v is UploadValue => {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.filename === 'string' &&
    typeof o.mimeType === 'string' &&
    typeof o.size === 'number' &&
    Buffer.isBuffer(o.buffer)
  )
}

export const GraphQLUpload: GraphQLScalarType<UploadValue, never> = new GraphQLScalarType({
  name: 'Upload',
  description:
    'A binary file upload — wire format follows the GraphQL multipart request spec ' +
    '(https://github.com/jaydenseric/graphql-multipart-request-spec). ' +
    'The client sends `multipart/form-data` with `operations`, `map`, and one part per file.',
  serialize() {
    throw new GraphQLError('Upload scalar is input-only — resolvers may not return it.')
  },
  parseValue(value): UploadValue {
    if (!isUploadValue(value)) {
      throw new GraphQLError(
        'Upload variable must reference a multipart file part — submit the request as ' +
          'multipart/form-data with operations + map + file parts per the spec.',
      )
    }
    return value
  },
  parseLiteral(ast): never {
    throw new GraphQLError(`Upload scalar cannot be inlined as a literal (${ast.kind}).`)
  },
})
