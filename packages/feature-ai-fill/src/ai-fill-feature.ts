/**
 * `aiFillFeature` — resource plugin that adds an AI-powered "fill from photo"
 * action to a resource. Returns a `FeatureFn` that appends an `aiFill`
 * resource-scoped action to the resource. The action descriptor carries the
 * full feature options inside its `custom` payload, so:
 *
 *   - the frontend reads `resource.actions.find(a => a.name === 'aiFill')`
 *     to detect that AI fill is available, and only the marker bit;
 *   - the backend controller (`@modern-admin/feature-ai-fill/nest`) reads the
 *     same descriptor at request time to know which fields to include, what
 *     model to use, and which optional prompt suffix to apply.
 *
 * The action handler itself is a placeholder — the real flow goes through the
 * multipart endpoint `POST /admin/api/resources/:id/actions/aiFill`.
 *
 * @example
 * aiFillFeature({
 *   prompt: 'This is a product label. Extract the product details.',
 *   fields: {
 *     name: { hint: 'Product name, usually the largest text on the label' },
 *     price: { hint: 'Price in store currency, numeric only' },
 *     barcode: { hint: 'EAN-13 / UPC-A barcode digits, if visible' },
 *     internalNote: { exclude: true },
 *   },
 * })
 */

import type {
  ActionContext,
  ActionRequest,
  ActionResponse,
  FeatureFn,
  ResourceOptions,
} from '@modern-admin/core'
import type { AiFillFeatureOptions } from './types.js'

const placeholderHandler = async (
  _request: ActionRequest,
  _context: ActionContext,
): Promise<ActionResponse> => ({
  notice: {
    type: 'error',
    message:
      'The aiFill action cannot be invoked through the standard action pipeline. ' +
      'The real endpoint is POST /admin/api/resources/:id/ai-fill (multipart/form-data). ' +
      'Make sure ModernAdminAiFillModule.forRoot() is imported in your NestJS app module.',
  },
})

/** Marker key the controller searches for on action descriptors. */
export const AI_FILL_ACTION_NAME = 'aiFill'

export function aiFillFeature(options: AiFillFeatureOptions = {}): FeatureFn {
  return (resourceOptions: ResourceOptions): ResourceOptions => {
    // `actionOptionsZ` is `.passthrough()`, so non-schema keys like `handler`,
    // `actionType` etc. survive the merge. The cast to ResourceOptions['actions']
    // mirrors the pattern used by uploadFeature.
    const aiFillAction = {
      actionType: 'resource',
      handler: placeholderHandler,
      // Hidden from auto-generated action menus — the button is explicitly
      // surfaced by the edit-page header when custom.aiFill is truthy.
      isVisible: false,
      component: 'AiFill',
      custom: {
        aiFill: true,
        // Stuff the full options into custom so the controller can read them
        // at request time without a separate registry lookup.
        ...(options.prompt !== undefined ? { prompt: options.prompt } : {}),
        ...(options.model !== undefined ? { model: options.model } : {}),
        ...(options.fields !== undefined ? { fields: options.fields } : {}),
      },
    }

    return {
      ...resourceOptions,
      actions: {
        ...(resourceOptions.actions ?? {}),
        [AI_FILL_ACTION_NAME]: {
          ...(resourceOptions.actions?.[AI_FILL_ACTION_NAME] ?? {}),
          ...aiFillAction,
        },
      } as ResourceOptions['actions'],
    }
  }
}
