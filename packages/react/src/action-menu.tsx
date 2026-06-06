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
import type { ActionDescriptor, ActionGroup } from './types.js'

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

const getActionLabel = (action: ActionDescriptor): string =>
  typeof action.custom?.label === 'string' ? action.custom.label : action.name

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
): React.ReactNode =>
  nodes.map((node) => {
    if (node.kind === 'action') {
      return (
        <DropdownMenuItem
          key={node.action.name}
          onSelect={() => onAction(node.action)}
        >
          <Zap className="size-4" /> {getActionLabel(node.action)}
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
            {renderNodes(node.group.items, onAction)}
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
  const nodes = React.useMemo(() => buildActionMenuTree(actions), [actions])
  if (nodes.length === 0) return null
  return <>{renderNodes(nodes, onAction)}</>
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
