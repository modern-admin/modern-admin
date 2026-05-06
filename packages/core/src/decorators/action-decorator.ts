import type {
  Action,
  ActionContext,
  ActionDescriptor,
  ActionResponse,
} from '../actions/action.js'
import type { ActionOptions } from './action-options.js'

const resolveFlag = async (
  flag: boolean | ((ctx: ActionContext) => boolean | Promise<boolean>) | undefined,
  ctx: ActionContext,
  fallback: boolean,
): Promise<boolean> => {
  if (flag === undefined) return fallback
  if (typeof flag === 'boolean') return flag
  return Boolean(await flag(ctx))
}

/**
 * Resolves a static `Action` definition + user overrides at request time:
 * - merges flags / hooks
 * - evaluates isVisible / isAccessible against the action context
 * - exposes a transport-friendly descriptor + executor
 */
export class ActionDecorator<R extends ActionResponse = ActionResponse> {
  public readonly merged: Action<R>

  constructor(
    base: Action<R>,
    overrides: ActionOptions = {},
    public readonly resourceId: string,
  ) {
    this.merged = {
      ...base,
      ...(overrides as Partial<Action<R>>),
    }
  }

  name(): string {
    return this.merged.name
  }

  actionType(): Action<R>['actionType'] {
    return this.merged.actionType
  }

  toDescriptor(): ActionDescriptor {
    const { name, actionType, guard, component, custom } = this.merged
    return {
      name,
      actionType,
      resourceId: this.resourceId,
      ...(guard !== undefined ? { guard } : {}),
      ...(component !== undefined ? { component } : {}),
      ...(custom !== undefined ? { custom } : {}),
    }
  }

  async isAccessible(context: ActionContext): Promise<boolean> {
    return resolveFlag(this.merged.isAccessible, context, true)
  }

  async isVisible(context: ActionContext): Promise<boolean> {
    return resolveFlag(this.merged.isVisible, context, true)
  }
}
