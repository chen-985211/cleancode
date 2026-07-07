import type { NodeProps } from '@xyflow/react'
import {
  Check,
  Edit3,
  Maximize2,
  Minimize2,
  Minus,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  Unlink,
  X
} from 'lucide-react'
import { memo, useCallback, useState, type FormEvent, type ReactNode } from 'react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalGroupFlowNode, TerminalViewState } from './types'

export const TerminalGroupNode = memo(function TerminalGroupNode({
  data
}: NodeProps<TerminalGroupFlowNode>) {
  const group = data.group
  const [isEditingName, setIsEditingName] = useState(false)
  const [draftName, setDraftName] = useState(group.name)
  const trimmedDraftName = draftName.trim()
  const status = getTerminalGroupStatus(data.memberBlocks, data.memberStates)
  const className = [
    'terminal-group-node',
    group.isCollapsed ? 'terminal-group-node--collapsed' : '',
    data.isSelected ? 'terminal-group-node--selected' : ''
  ]
    .filter(Boolean)
    .join(' ')

  const saveName = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      if (!trimmedDraftName) {
        return
      }

      await data.onUpdateGroupMetadata(group, { name: trimmedDraftName })
      setIsEditingName(false)
    },
    [data, group, trimmedDraftName]
  )

  return (
    <section className={className} data-terminal-group-id={group.id}>
      <div
        className={[
          'terminal-group-node__header',
          isEditingName ? 'terminal-group-node__header--editing' : ''
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="terminal-group-node__title">
          {isEditingName ? (
            <form className="terminal-group-name-form nodrag" onSubmit={saveName}>
              <input
                aria-label="组合名称"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
              />
              <button
                className="terminal-group-node__action"
                type="submit"
                aria-label="保存组合名称"
                title="保存组合名称"
                data-cc-tooltip="保存组合名称"
                disabled={!trimmedDraftName}
              >
                <Check size={15} aria-hidden="true" />
              </button>
              <button
                className="terminal-group-node__action"
                type="button"
                aria-label="取消编辑组合名称"
                title="取消"
                data-cc-tooltip="取消"
                onClick={() => {
                  setDraftName(group.name)
                  setIsEditingName(false)
                }}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </form>
          ) : (
            <>
              <strong>{group.name}</strong>
              <span>{status.label}</span>
            </>
          )}
        </div>
        {isEditingName ? null : (
          <div
            className="terminal-group-node__actions nodrag"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <IconButton
              label={`${group.name} 启动全部`}
              title="启动全部"
              onClick={() => data.onStartGroup(group)}
            >
              <Play size={15} aria-hidden="true" />
            </IconButton>
            <IconButton
              label={`${group.name} 停止全部`}
              title="停止全部"
              onClick={() => data.onStopGroup(group)}
            >
              <Square size={14} aria-hidden="true" />
            </IconButton>
            <IconButton
              label={`${group.name} 重启全部`}
              title="重启全部"
              onClick={() => data.onRestartGroup(group)}
            >
              <RefreshCw size={15} aria-hidden="true" />
            </IconButton>
            <IconButton
              label={`${group.name} 编辑组合名称`}
              title="编辑组合名称"
              onClick={() => setIsEditingName(true)}
            >
              <Edit3 size={15} aria-hidden="true" />
            </IconButton>
            <IconButton
              label={`${group.name} ${group.isCollapsed ? '展开组合' : '折叠组合'}`}
              title={group.isCollapsed ? '展开组合' : '折叠组合'}
              onClick={() => void data.onToggleGroupCollapsed(group, !group.isCollapsed)}
            >
              {group.isCollapsed ? (
                <Maximize2 size={15} aria-hidden="true" />
              ) : (
                <Minimize2 size={15} aria-hidden="true" />
              )}
            </IconButton>
            <IconButton
              label={`${group.name} 添加选中终端`}
              title="添加选中终端"
              disabled={data.selectedUngroupedTerminalBlockIds.length === 0}
              onClick={() => void data.onAddSelectedTerminalsToGroup(group)}
            >
              <Plus size={15} aria-hidden="true" />
            </IconButton>
            <IconButton
              label={`${group.name} 移出选中终端`}
              title="移出选中终端"
              disabled={data.selectedMemberBlockIds.length === 0}
              onClick={() => void data.onRemoveSelectedTerminalsFromGroup(group)}
            >
              <Minus size={15} aria-hidden="true" />
            </IconButton>
            <IconButton
              label={`${group.name} 解散组合`}
              title="解散组合"
              onClick={() => void data.onDissolveGroup(group)}
            >
              <Trash2 size={15} aria-hidden="true" />
            </IconButton>
          </div>
        )}
      </div>
      {group.isCollapsed ? (
        <div className="terminal-group-node__members">
          {data.memberBlocks.map((block) => (
            <MemberPill
              key={block.id}
              block={block}
              state={data.memberStates[block.id]}
              onRemove={() => void data.onRemoveTerminalFromGroup(group, block)}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
})

interface IconButtonProps {
  readonly label: string
  readonly title: string
  readonly disabled?: boolean
  readonly onClick: () => void
  readonly children: ReactNode
}

function IconButton({ label, title, disabled = false, onClick, children }: IconButtonProps) {
  return (
    <button
      className="terminal-group-node__action"
      type="button"
      aria-label={label}
      title={title}
      data-cc-tooltip={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

interface MemberPillProps {
  readonly block: TerminalBlockSnapshot
  readonly state: TerminalViewState | undefined
  readonly onRemove: () => void
}

function MemberPill({ block, state, onRemove }: MemberPillProps) {
  const status = state?.status ?? 'idle'

  return (
    <span className={`terminal-group-node__member terminal-group-node__member--${status}`}>
      <span className="terminal-group-node__member-status" aria-hidden="true" />
      <span className="terminal-group-node__member-name">{block.name}</span>
      <button
        className="terminal-group-node__member-remove nodrag"
        type="button"
        aria-label={`${block.name} 移出组合`}
        title="移出组合"
        data-cc-tooltip="移出组合"
        onClick={onRemove}
      >
        <Unlink size={12} aria-hidden="true" />
      </button>
    </span>
  )
}

function getTerminalGroupStatus(
  memberBlocks: readonly TerminalBlockSnapshot[],
  memberStates: Record<string, TerminalViewState>
): { readonly label: string } {
  const totalCount = memberBlocks.length
  const runningCount = memberBlocks.filter(
    (block) => memberStates[block.id]?.status === 'running'
  ).length
  const failedCount = memberBlocks.filter(
    (block) => memberStates[block.id]?.status === 'failed'
  ).length

  if (failedCount > 0) {
    return { label: '有失败' }
  }

  if (totalCount > 0 && runningCount === totalCount) {
    return { label: `${runningCount}/${totalCount} 运行中` }
  }

  if (runningCount > 0) {
    return { label: '部分运行' }
  }

  return { label: '未启动' }
}
