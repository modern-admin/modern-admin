import * as React from 'react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@modern-admin/ui'
import { MoreHorizontal, Zap } from 'lucide-react'
import type { ActionDescriptor, ActionGroup, RecordJSON, ResourceJSON } from './types.js'
import { useI18n } from './i18n.js'

interface ActionMenuGroupNode {
  key: string
  group: ActionGroup
  items: ActionMenuNode[]
}

type ActionMenuNode =
  | { kind: 'action'; action: ActionDescriptor }
  | { kind: 'group'; group: ActionMenuGroupNode }

export interface ActionMenuProps {
  actions: ActionDescriptor[]
  onAction(action: ActionDescriptor): void
  t: (key: string, params?: Record<string, string | number>) => string
  trigger?: React.ReactElement
  menuLabel?: string
  align?: 'start' | 'center' | 'end'
}

/**
 * Whether a record-scoped action should be offered for a specific record.
 *
 * The server resolves `isVisible`/`isAccessible` per record and reports the
 * survivors in `RecordJSON.recordActions`. A record without that field made
 * it here outside the action pipeline (or from an older server) — that is
 * "no opinion", so everything stays visible rather than everything vanishing.
 */
export const isActionAllowedForRecord = (
  actionName: string,
  record: Pick<RecordJSON, 'recordActions'> | undefined,
): boolean => !record?.recordActions || record.recordActions.includes(actionName)

/** Whether the server-advertised resource metadata offers an action. */
export const isActionAllowedForResource = (
  actionName: string,
  resource: Pick<ResourceJSON, 'actions'> | undefined,
): boolean => resource?.actions.some(
  (action) => action.actionType === 'resource' && action.name === actionName,
) ?? false

/** Narrow a resource's record actions down to the ones this record offers. */
export const visibleRecordActions = (
  actions: ActionDescriptor[],
  record: Pick<RecordJSON, 'recordActions'> | undefined,
): ActionDescriptor[] => {
  if (!record?.recordActions) return actions
  const allowed = new Set(record.recordActions)
  return actions.filter((a) => allowed.has(a.name))
}

/** Display label for an action: the (already localized) `custom.label` set
 *  by the metadata translator, falling back to the raw action name. */
export const getActionLabel = (
  action: ActionDescriptor,
  t?: (key: string) => string,
): string => {
  if (typeof action.custom?.label === 'string') return action.custom.label
  if (typeof action.custom?.labelKey === 'string' && t) return t(action.custom.labelKey)
  return action.name
}

const buildActionMenuTree = (actions: ActionDescriptor[]): ActionMenuNode[] => {
  const root: ActionMenuNode[] = []
  const groups = new Map<string, ActionMenuGroupNode>()

  const ensureGroup = (target: ActionMenuNode[], path: ActionGroup[], depth: number): ActionMenuNode[] => {
    if (depth >= path.length) return target
    const segment = path[depth]!
    const key = path
      .slice(0, depth + 1)
      .map((item) => item.name)
      .join('>')
    let group = groups.get(key)
    if (!group) {
      group = { key, group: segment, items: [] }
      groups.set(key, group)
      target.push({ kind: 'group', group })
    }
    return ensureGroup(group.items, path, depth + 1)
  }

  for (const action of actions) {
    const nesting = action.nesting ?? []
    const target = nesting.length > 0 ? ensureGroup(root, nesting, 0) : root
    target.push({ kind: 'action', action })
  }

  return root
}

const renderNodes = (
  nodes: ActionMenuNode[],
  onAction: (action: ActionDescriptor) => void,
  t: (key: string) => string,
): React.ReactNode =>
  nodes.map((node) => {
    if (node.kind === 'action') {
      return (
        <DropdownMenuItem
          key={node.action.name}
          onSelect={() => onAction(node.action)}
        >
          <Zap className="size-4" /> {getActionLabel(node.action, t)}
        </DropdownMenuItem>
      )
    }
    return (
      <DropdownMenuSub key={node.group.key}>
        <DropdownMenuSubTrigger>
          {node.group.group.name}
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent>
            {renderNodes(node.group.items, onAction, t)}
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    )
  })

export function ActionMenuItems({
  actions,
  onAction,
}: {
  actions: ActionDescriptor[]
  onAction(action: ActionDescriptor): void
}): React.ReactElement | null {
  const { t } = useI18n()
  const nodes = React.useMemo(() => buildActionMenuTree(actions), [actions])
  if (nodes.length === 0) return null
  return <>{renderNodes(nodes, onAction, t)}</>
}

export function ActionMenu({
  actions,
  onAction,
  t,
  trigger,
  menuLabel,
  align = 'end',
}: ActionMenuProps): React.ReactElement | null {
  const nodes = React.useMemo(() => buildActionMenuTree(actions), [actions])
  if (nodes.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Zap className="size-4" />
            {t('common:actions')}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuLabel>{menuLabel ?? t('common:actions')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ActionMenuItems actions={actions} onAction={onAction} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function MoreActionsMenu({
  actions,
  onAction,
  t,
  menuLabel,
}: Omit<ActionMenuProps, 'trigger' | 'align'>): React.ReactElement | null {
  if (actions.length === 0) return null
  return (
    <ActionMenu
      actions={actions}
      onAction={onAction}
      t={t}
      menuLabel={menuLabel}
      trigger={(
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="size-4" />
          <span className="sr-only">{t('common:openMenu')}</span>
        </Button>
      )}
    />
  )
}
