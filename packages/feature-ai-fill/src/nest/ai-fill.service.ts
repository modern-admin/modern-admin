/**
 * AiFillService — backend logic for "fill form from photo":
 *
 *   1. Permission gate: invoke the `aiFill` action via `admin.invoke()` so
 *      all role/api-key/isAccessible checks run before any AI call is made.
 *   2. Resolve the `aiFill` action descriptor to get feature options.
 *   3. Build a Zod schema from the editable properties (with per-field hints).
 *   4. Call OpenRouter via the Vercel AI SDK `generateObject` using a vision
 *      model. The image is delivered as an inline `file` content part.
 *   5. Return the extracted values (nulls stripped) to the controller.
 *
 * AI provider settings (API key, default model) are read from the same
 * `configStore` slot used by the AI assistant ("modern-admin.ai-assistant"),
 * so a single configuration powers both features. Module-level overrides
 * (`apiKey`, `defaultModel`) take precedence when provided.
 */

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common'
import { generateObject } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import {
  type CurrentAdmin,
  ForbiddenError,
  type IConfigStore,
  type ModernAdmin,
  type PropertyJSON,
  ResourceNotFoundError,
} from '@modern-admin/core'
import type { ModernAdminModuleOptions } from '@modern-admin/nest'
import { AI_ASSISTANT_SETTINGS_KEY, MODERN_ADMIN, MODERN_ADMIN_OPTIONS } from '@modern-admin/nest'
import { buildAiFillSchema } from '../schema-builder.js'
import type { AiFillFeatureOptions, AiFillResponse } from '../types.js'
import { AI_FILL_ACTION_NAME } from '../ai-fill-feature.js'
import { AI_FILL_MODULE_OPTIONS, type ModernAdminAiFillModuleOptions } from './ai-fill.tokens.js'

const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB
const DEFAULT_MODEL = 'google/gemini-3.1-flash-lite-preview'
/** Hard ceiling on AI call duration. OpenRouter vision models are typically
 *  well under 30 s, but this prevents indefinite hangs on slow connections. */
const AI_TIMEOUT_MS = 30_000

interface StoredAiSettings {
  enabled?: boolean
  model?: string
  apiKey?: string
}

@Injectable()
export class AiFillService {
  private readonly logger = new Logger(AiFillService.name)

  constructor(
    @Inject(MODERN_ADMIN) private readonly admin: ModernAdmin,
    @Inject(MODERN_ADMIN_OPTIONS) private readonly adminOptions: ModernAdminModuleOptions,
    @Inject(AI_FILL_MODULE_OPTIONS) private readonly options: ModernAdminAiFillModuleOptions,
  ) {}

  /** Maximum accepted image upload size, in bytes. */
  get maxImageBytes(): number {
    return this.options.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES
  }

  async fill(
    resourceId: string,
    image: { buffer: Buffer; mimeType: string; size: number },
    currentAdmin: CurrentAdmin | undefined,
  ): Promise<AiFillResponse> {
    if (!image.mimeType.startsWith('image/')) {
      throw new BadRequestException(`Unsupported media type: ${image.mimeType}. Image required.`)
    }
    if (image.size > this.maxImageBytes) {
      throw new BadRequestException(
        `Image too large (${image.size} bytes). Maximum allowed: ${this.maxImageBytes} bytes.`,
      )
    }

    // 1 — Permission gate: run invoke() so role/api-key/isAccessible checks
    //     fire before any expensive AI call is made. The placeholder handler
    //     returns a notice (not an exception), so a clean return = access OK.
    try {
      await this.admin.invoke(
        { params: { resourceId, action: AI_FILL_ACTION_NAME }, method: 'post' },
        currentAdmin,
      )
    } catch (err) {
      if (err instanceof ForbiddenError) throw new ForbiddenException(err.message)
      if (err instanceof ResourceNotFoundError) throw new NotFoundException(err.message)
      // Any other error (ActionNotFoundError, etc.) → feature not configured.
      throw new BadRequestException(
        `aiFill is not configured for resource "${resourceId}". ` +
          'Apply aiFillFeature() to the resource and import ModernAdminAiFillModule.',
      )
    }

    // 2 — Resolve resource + action descriptor.
    const { resource, featureOptions } = this.resolveDescriptor(resourceId)

    // 3 — Build schema from editable properties.
    const editableProperties: PropertyJSON[] = resource
      .decorate()
      .propertiesForView('edit')
      .map((p) => p.toJSON())

    const { schema, fieldGuide, includedPaths } = buildAiFillSchema(
      editableProperties,
      featureOptions.fields,
    )
    if (includedPaths.length === 0) {
      throw new PreconditionFailedException(
        `Resource "${resourceId}" has no AI-fillable properties.`,
      )
    }

    // 4 — Resolve AI provider settings.
    const { apiKey, model } = await this.resolveProviderSettings(featureOptions.model)
    if (!apiKey) {
      throw new PreconditionFailedException(
        'OpenRouter API key is not configured. Set it via Settings → AI Assistant.',
      )
    }

    // 5 — Build prompt and invoke the model with a hard timeout.
    const openrouter = createOpenRouter({
      apiKey,
      appName: this.options.appName ?? 'Modern Admin',
      ...(this.options.appUrl ? { appUrl: this.options.appUrl } : {}),
    })

    const systemPrompt = buildSystemPrompt(fieldGuide, featureOptions.prompt)
    const abortController = new AbortController()
    const timeoutId = setTimeout(() => abortController.abort('AI fill timeout'), AI_TIMEOUT_MS)

    try {
      const result = await generateObject({
        model: openrouter(model),
        schema,
        schemaName: 'FormValues',
        schemaDescription:
          'Extracted form values keyed by property path. Use null for any field ' +
          'whose value cannot be confidently determined from the image.',
        system: systemPrompt,
        abortSignal: abortController.signal,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'Extract the form values from this image. Use null for any field ' +
                  'you cannot determine with high confidence.',
              },
              {
                type: 'file',
                data: image.buffer,
                mediaType: image.mimeType,
              },
            ],
          },
        ],
      })

      // Drop nulls — frontend only sets fields the model confidently extracted.
      const values: Record<string, unknown> = {}
      const raw = result.object as Record<string, unknown>
      for (const path of includedPaths) {
        const v = raw[path]
        if (v !== null && v !== undefined) values[path] = v
      }
      return { values }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`AI fill failed for resource "${resourceId}": ${message}`)
      throw new InternalServerErrorException('AI fill failed. Check server logs for details.')
    } finally {
      clearTimeout(timeoutId)
    }
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  /** Extract the aiFill feature options from the action descriptor.
   *  Permission checking already happened via invoke() above, so by the time
   *  we get here we know the action exists and the user has access. */
  private resolveDescriptor(resourceId: string): {
    resource: ReturnType<ModernAdmin['findResource']>
    featureOptions: AiFillFeatureOptions
  } {
    const resource = this.admin.findResource(resourceId)
    const action = resource.decorate().getAction(AI_FILL_ACTION_NAME)
    if (!action) {
      throw new BadRequestException(
        `Resource "${resourceId}" does not have the aiFill action configured.`,
      )
    }
    const custom = (action.merged.custom ?? {}) as {
      aiFill?: boolean
      prompt?: string
      model?: string
      fields?: AiFillFeatureOptions['fields']
    }
    return {
      resource,
      featureOptions: {
        ...(custom.prompt !== undefined ? { prompt: custom.prompt } : {}),
        ...(custom.model !== undefined ? { model: custom.model } : {}),
        ...(custom.fields !== undefined ? { fields: custom.fields } : {}),
      },
    }
  }

  /**
   * Resolve the API key and model to use, layered:
   *
   *   1. resource-level `aiFillFeature({ model })` → model only
   *   2. `ModernAdminAiFillModule.forRoot({ defaultModel })` → model fallback
   *   3. stored `modern-admin.ai-assistant` configStore settings → both
   *   4. DEFAULT_MODEL constant if nothing else is set
   *
   * API key priority: module-level `apiKey` option > stored configStore key.
   * If `stored.enabled === false`, no stored key is returned (respects global
   * AI disable toggle).
   */
  private async resolveProviderSettings(
    resourceModelOverride: string | undefined,
  ): Promise<{ apiKey: string; model: string }> {
    let storedApiKey = ''
    let storedModel: string | undefined
    let storedEnabled = true // default: AI is on unless explicitly disabled

    const configStore = this.adminOptions.configStore as IConfigStore | undefined
    if (configStore) {
      try {
        const raw = await configStore.get('global', null, AI_ASSISTANT_SETTINGS_KEY)
        if (raw && typeof raw === 'object') {
          const stored = raw as StoredAiSettings
          if (stored.enabled === false) storedEnabled = false
          if (storedEnabled && typeof stored.apiKey === 'string') {
            storedApiKey = stored.apiKey.trim()
          }
          if (storedEnabled && typeof stored.model === 'string') {
            storedModel = stored.model
          }
        }
      } catch (err) {
        this.logger.warn(
          `Could not read AI settings from configStore: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }

    const apiKey = this.options.apiKey?.trim() || storedApiKey
    const model =
      resourceModelOverride ??
      this.options.defaultModel ??
      storedModel ??
      DEFAULT_MODEL

    return { apiKey, model }
  }
}

function buildSystemPrompt(fieldGuide: string, extraPrompt?: string): string {
  const lines = [
    'You are a structured-data extraction assistant for an admin panel.',
    'Read the provided image and extract values for the form fields described below.',
    'Return strictly the JSON object matching the schema — no commentary, no markdown.',
    'For every field you cannot extract with high confidence from the image, return null.',
    'Never invent values. Never guess. Prefer null over a wrong answer.',
    '',
    'Fields:',
    fieldGuide,
  ]
  if (extraPrompt?.trim()) {
    lines.push('', 'Additional context from the resource owner:', extraPrompt.trim())
  }
  return lines.join('\n')
}
