/**
 * GraphQL extension for the upload feature — mirrors the REST upload
 * controller (`POST /admin/api/resources/:id/actions/upload` and `DELETE`)
 * with two mutations:
 *
 *   - `adminUpload(resourceId, field, file)` — upload a single file via the
 *     `Upload` scalar (multipart/form-data per the GraphQL multipart spec).
 *     Returns `UploadedFileInfo`.
 *   - `adminCancelUpload(resourceId, field, key)` — cancel a still-pending
 *     upload (file uploaded but record not yet saved). Returns `Boolean`.
 *
 * The extension is wired in the host application:
 *   ```ts
 *   ModernAdminGraphqlModule.forRoot({
 *     extensions: [uploadGraphqlExtension()],
 *   })
 *   ```
 *
 * Authorisation re-uses the same `ModernAdmin.invoke()` access checks via
 * `findResource(resourceId, currentAdmin)`.
 *
 * `@modern-admin/graphql` is an *optional peer dependency* of feature-upload —
 * if you do not use the GraphQL transport you do not need to import this
 * module at all.
 */

import {
  GraphQLBoolean,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
} from 'graphql'
import {
  type ExtensionContext,
  type GraphqlSchemaExtension,
  type GraphqlContext,
} from '@modern-admin/graphql'
import { ForbiddenError, ResourceNotFoundError } from '@modern-admin/core'
import { UploadProviderRegistry } from './registry.js'
import { PendingUploadsRegistry } from './pending-registry.js'
import type { UploadedFileInfo } from './types.js'

/** Default TTL for pending upload entries, mirrored from the controller. */
const DEFAULT_PENDING_TTL_MS = 60 * 60 * 1000

export interface UploadGraphqlExtensionOptions {
  /**
   * TTL applied when registering an uploaded key as pending. Mirrors the
   * `pendingTtlMs` option on `ModernAdminUploadModule.forRoot()` — set both
   * to the same value to keep REST and GraphQL behaviour identical.
   */
  pendingTtlMs?: number
}

export function uploadGraphqlExtension(
  options: UploadGraphqlExtensionOptions = {},
): (ctx: ExtensionContext) => GraphqlSchemaExtension {
  const ttlMs = options.pendingTtlMs ?? DEFAULT_PENDING_TTL_MS
  return ({ Upload }): GraphqlSchemaExtension => {
    const UploadedFileInfoType = new GraphQLObjectType<UploadedFileInfo, GraphqlContext>({
      name: 'UploadedFileInfo',
      description: 'Metadata returned for one successfully uploaded file.',
      fields: () => ({
        key: { type: new GraphQLNonNull(GraphQLString) },
        url: { type: new GraphQLNonNull(GraphQLString) },
        name: { type: new GraphQLNonNull(GraphQLString) },
        size: { type: new GraphQLNonNull(GraphQLInt) },
        mimeType: { type: new GraphQLNonNull(GraphQLString) },
      }),
    })

    return {
      name: 'feature-upload',
      types: [UploadedFileInfoType],
      mutations: {
        adminUpload: {
          type: new GraphQLNonNull(UploadedFileInfoType),
          description:
            'Upload a single file for an upload-enabled property. Multi-file ' +
            'properties accept one mutation invocation per file.',
          args: {
            resourceId: { type: new GraphQLNonNull(GraphQLString) },
            field: { type: new GraphQLNonNull(GraphQLString) },
            file: { type: new GraphQLNonNull(Upload) },
          },
          async resolve(_src, args, ctx) {
            const { resourceId, field } = args as { resourceId: string; field: string }
            const { providerId, registered } = resolveProperty(ctx, resourceId, field)
            const upload = args.file as {
              filename: string
              mimeType: string
              size: number
              buffer: Buffer
            }
            const computedKey = registered.uploadPath
              ? registered.uploadPath(upload.filename)
              : undefined
            const key = await registered.provider.upload(
              {
                originalName: upload.filename,
                mimeType: upload.mimeType,
                size: upload.size,
                buffer: upload.buffer,
              },
              computedKey,
            )
            PendingUploadsRegistry.track(key, providerId, ttlMs)
            const url = await registered.provider.getUrl(key)
            const info: UploadedFileInfo = {
              key,
              url,
              name: upload.filename,
              size: upload.size,
              mimeType: upload.mimeType,
            }
            return info
          },
        },
        adminCancelUpload: {
          type: new GraphQLNonNull(GraphQLBoolean),
          description:
            'Cancel a still-pending upload (file uploaded but record not yet ' +
            'saved). Returns false when the key is no longer pending.',
          args: {
            resourceId: { type: new GraphQLNonNull(GraphQLString) },
            field: { type: new GraphQLNonNull(GraphQLString) },
            key: { type: new GraphQLNonNull(GraphQLString) },
          },
          async resolve(_src, args, ctx) {
            const { resourceId, field, key } = args as {
              resourceId: string
              field: string
              key: string
            }
            // Validate the resource/field exists & is upload-enabled. Mirrors
            // the REST controller's check — prevents leaking arbitrary
            // resource ids to authenticated clients.
            resolveProperty(ctx, resourceId, field)
            return PendingUploadsRegistry.cancel(key)
          },
        },
      },
    }
  }
}

/**
 * Resolve the resource + property and ensure it is wired to an upload
 * provider. Mirrors the private helper in the REST upload controller — kept
 * private to this module to avoid coupling. Throws GraphQL-friendly Error
 * objects (not Nest exceptions) so they surface as standard GraphQL errors.
 */
function resolveProperty(
  ctx: GraphqlContext,
  resourceId: string,
  field: string,
): { providerId: string; registered: NonNullable<ReturnType<typeof UploadProviderRegistry.get>> } {
  let resource
  try {
    resource = ctx.admin.findResource(resourceId)
  } catch (err) {
    if (err instanceof ResourceNotFoundError) throw new Error(err.message)
    if (err instanceof ForbiddenError) throw new Error(err.message)
    throw err
  }
  const decorator = resource.decorate()
  const prop = decorator.getPropertyByKey(field)
  if (!prop) {
    throw new Error(`Property "${field}" not found on resource "${resourceId}"`)
  }
  const propJson = prop.toJSON()
  const providerId = propJson.custom?.uploadProviderId as string | undefined
  if (!providerId) {
    throw new Error(
      `Property "${field}" on resource "${resourceId}" is not configured for upload. ` +
        'Apply uploadFeature() to the resource.',
    )
  }
  const registered = UploadProviderRegistry.get(providerId)
  if (!registered) {
    throw new Error(`Upload provider "${providerId}" is not registered.`)
  }
  return { providerId, registered }
}
