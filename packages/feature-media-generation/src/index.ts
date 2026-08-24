import {
  type ActionContext,
  type ActionRequest,
  type ActionResponse,
  type FeatureFn,
  type MediaGenerationFileType,
  type ResourceOptions,
} from '@modern-admin/core'

export const MEDIA_GENERATION_ACTION_COMPONENT = 'modern-admin:media-generation'
export const DEFAULT_MEDIA_GENERATION_ACTION = 'generateMedia'

export interface MediaGenerationFeatureOptions {
  /** Upload-enabled property that receives the imported file key. */
  targetProperty: string
  /** Record properties exposed to the prompt template. */
  sourceProperties?: string[]
  /** Template placeholders use `{property.path}` syntax. */
  promptTemplate?: string
  mediaTypes?: MediaGenerationFileType[]
  defaultModel?: string
  actionName?: string
  labelKey?: string
  nesting?: string
}

const valueAtPath = (record: Record<string, unknown>, path: string): unknown => {
  if (path in record) return record[path]
  return path.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    return (value as Record<string, unknown>)[segment]
  }, record)
}

const promptFromTemplate = (
  template: string,
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): string => template.replace(/\{([^{}]+)\}/g, (_match, rawPath: string) => {
  const path = rawPath.trim()
  if (!allowed.has(path)) return ''
  const value = valueAtPath(record, path)
  if (value === null || value === undefined) return ''
  return Array.isArray(value) ? value.join(', ') : String(value)
})

/**
 * Adds a record action backed by the built-in React media-generation dialog.
 * Paid generation and apply operations go through the dedicated Nest service;
 * this action is the permission and record-context boundary.
 */
export function mediaGenerationFeature(options: MediaGenerationFeatureOptions): FeatureFn {
  const actionName = options.actionName ?? DEFAULT_MEDIA_GENERATION_ACTION
  const sourceProperties = options.sourceProperties ?? []
  const allowedSources = new Set(sourceProperties)
  const promptTemplate = options.promptTemplate ?? sourceProperties.map((path) => `{${path}}`).join('\n')

  return (resourceOptions: ResourceOptions): ResourceOptions => ({
    ...resourceOptions,
    actions: {
      ...(resourceOptions.actions ?? {}),
      [actionName]: {
        name: actionName,
        actionType: 'record',
        component: MEDIA_GENERATION_ACTION_COMPONENT,
        nesting: options.nesting,
        custom: {
          labelKey: options.labelKey ?? 'mediaGeneration:action.label',
          showAs: 'dialog',
          mediaGeneration: {
            targetProperty: options.targetProperty,
            sourceProperties,
            mediaTypes: options.mediaTypes ?? ['image', 'video'],
            ...(options.defaultModel ? { defaultModel: options.defaultModel } : {}),
          },
        },
        handler: (_request: ActionRequest, context: ActionContext): ActionResponse => {
          if (!context.record) throw new Error(`${actionName} requires a record`)
          const params = context.record.params
          return {
            record: context.record.toJSON(),
            mediaGeneration: {
              targetProperty: options.targetProperty,
              mediaTypes: options.mediaTypes ?? ['image', 'video'],
              suggestedPrompt: promptFromTemplate(promptTemplate, params, allowedSources),
              ...(options.defaultModel ? { defaultModel: options.defaultModel } : {}),
            },
          }
        },
      },
    },
  })
}
