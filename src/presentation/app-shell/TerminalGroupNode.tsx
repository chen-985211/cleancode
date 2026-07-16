import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Check, X } from 'lucide-react'
import { memo, useCallback, useState, type FormEvent, type ReactNode } from 'react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { agentApprovalTargetHandleId } from './agentApprovalHandles'
import {
  GroupAddIcon,
  GroupCollapseIcon,
  GroupDissolveIcon,
  GroupEditIcon,
  GroupExpandIcon,
  GroupMemberUnlinkIcon,
  GroupRemoveIcon,
  GroupRestartIcon,
  GroupStartIcon,
  GroupStopIcon
} from './TerminalGroupIcons'
import type { TerminalGroupFlowNode, TerminalViewState } from './types'
import { WorkbenchNodeSelectionVeil } from './WorkbenchNodeSelectionVeil'

export const TerminalGroupNode = memo(function TerminalGroupNode({
  data
}: NodeProps<TerminalGroupFlowNode>) {
  const group = data.group
  const [isEditingName, setIsEditingName] = useState(false)
  const [draftName, setDraftName] = useState(group.name)
  const trimmedDraftName = draftName.trim()
  const nameFormId = `terminal-group-name-form-${group.id}`
  const className = [
    'terminal-group-node',
    group.isCollapsed ? 'terminal-group-node--collapsed' : '',
    data.dropFeedback ? `terminal-group-node--drop-${data.dropFeedback}` : '',
    data.approvalIntent ? 'terminal-group-node--approval-target' : ''
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

  const startEditingName = useCallback(() => {
    setDraftName(group.name)
    setIsEditingName(true)
  }, [group.name])

  const cancelEditingName = useCallback(() => {
    setDraftName(group.name)
    setIsEditingName(false)
  }, [group.name])

  return (
    <section className={className} data-terminal-group-id={group.id}>
      <Handle
        id={agentApprovalTargetHandleId}
        className="agent-approval-intent-handle agent-approval-intent-handle--target"
        type="target"
        position={Position.Left}
        isConnectable={false}
      />
      {data.approvalIntent === 'contains-delete' ? (
        <span className="agent-approval-target-chip">包含待删除终端</span>
      ) : null}
      <div
        data-workbench-node-title="true"
        className={[
          'terminal-group-node__header',
          isEditingName ? 'terminal-group-node__header--editing' : ''
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="terminal-group-node__title">
          {isEditingName ? (
            <form
              id={nameFormId}
              className="terminal-group-name-form nodrag"
              onSubmit={saveName}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <input
                aria-label="组合名称"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
              />
            </form>
          ) : (
            <>
              <strong className="terminal-group-node__name" title={group.name}>
                {group.name}
              </strong>
              {data.dropFeedback ? (
                <span className="terminal-group-node__drop-hint">
                  {getDropFeedbackLabel(data.dropFeedback)}
                </span>
              ) : null}
            </>
          )}
        </div>

        {isEditingName ? (
          group.isCollapsed ? null : (
            <EditActions
              formId={nameFormId}
              canSave={Boolean(trimmedDraftName)}
              onCancel={cancelEditingName}
            />
          )
        ) : group.isCollapsed ? (
          <DisclosureButton data={data} />
        ) : (
          <GroupActionToolbar data={data} onEdit={startEditingName} isInline />
        )}
      </div>

      {group.isCollapsed ? (
        isEditingName ? (
          <div className="terminal-group-node__toolbar terminal-group-node__toolbar--editing">
            <EditActions
              formId={nameFormId}
              canSave={Boolean(trimmedDraftName)}
              onCancel={cancelEditingName}
            />
          </div>
        ) : (
          <GroupActionToolbar data={data} onEdit={startEditingName} />
        )
      ) : null}

      {group.isCollapsed ? (
        <div className="terminal-group-node__members">
          {data.memberBlocks.map((block) => (
            <MemberRow
              key={block.id}
              block={block}
              state={data.memberStates[block.id]}
              onRemove={() => void data.onRemoveTerminalFromGroup(group, block)}
            />
          ))}
        </div>
      ) : null}
      {data.isSelected ? <WorkbenchNodeSelectionVeil /> : null}
    </section>
  )
})

interface GroupActionToolbarProps {
  readonly data: TerminalGroupFlowNode['data']
  readonly isInline?: boolean
  readonly onEdit: () => void
}

function GroupActionToolbar({ data, isInline = false, onEdit }: GroupActionToolbarProps) {
  const group = data.group

  return (
    <div
      className={[
        'terminal-group-node__toolbar',
        'nodrag',
        isInline ? 'terminal-group-node__toolbar--inline' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        className="terminal-group-node__action-group terminal-group-node__action-group--runtime"
        data-control-group="runtime"
      >
        <IconButton
          label={`${group.name} 启动组合命令`}
          title="启动组合命令"
          tone="primary"
          surface="raised"
          onClick={() => data.onStartGroup(group)}
        >
          <GroupStartIcon />
        </IconButton>
        <IconButton
          label={`${group.name} 停止全部当前命令`}
          title="停止全部当前命令"
          surface="raised"
          onClick={() => data.onStopGroup(group)}
        >
          <GroupStopIcon />
        </IconButton>
        <IconButton
          label={`${group.name} 重开组合终端会话`}
          title="重开组合终端会话，不执行启动命令"
          surface="raised"
          onClick={() => data.onRestartGroup(group)}
        >
          <GroupRestartIcon />
        </IconButton>
      </div>

      <span
        className="terminal-group-node__toolbar-divider terminal-group-node__toolbar-divider--runtime"
        aria-hidden="true"
      />

      <div
        className="terminal-group-node__action-group terminal-group-node__action-group--structure"
        data-control-group="structure"
      >
        <IconButton
          label={`${group.name} 编辑组合名称`}
          title="编辑组合名称"
          surface="raised"
          onClick={onEdit}
        >
          <GroupEditIcon />
        </IconButton>
        {isInline ? <DisclosureButton data={data} /> : null}
        <div className="terminal-group-node__membership-actions" data-control-group="membership">
          <IconButton
            label={`${group.name} 添加选中终端`}
            title="添加选中终端"
            disabled={data.selectedUngroupedTerminalBlockIds.length === 0}
            onClick={() => void data.onAddSelectedTerminalsToGroup(group)}
          >
            <GroupAddIcon />
          </IconButton>
          <IconButton
            label={`${group.name} 移出选中终端`}
            title="移出选中终端"
            disabled={data.selectedMemberBlockIds.length === 0}
            onClick={() => void data.onRemoveSelectedTerminalsFromGroup(group)}
          >
            <GroupRemoveIcon />
          </IconButton>
        </div>
      </div>

      <span
        className="terminal-group-node__toolbar-divider terminal-group-node__toolbar-divider--structure"
        aria-hidden="true"
      />

      <div
        className="terminal-group-node__action-group terminal-group-node__action-group--danger"
        data-control-group="danger"
      >
        <IconButton
          label={`${group.name} 解散组合`}
          title="解散组合，保留成员终端"
          tone="danger"
          surface="raised"
          onClick={() => void data.onDissolveGroup(group)}
        >
          <GroupDissolveIcon />
        </IconButton>
      </div>
    </div>
  )
}

interface DisclosureButtonProps {
  readonly data: TerminalGroupFlowNode['data']
}

function DisclosureButton({ data }: DisclosureButtonProps) {
  const group = data.group
  const action = group.isCollapsed ? '展开' : '折叠'

  return (
    <button
      className="terminal-group-node__disclosure nodrag"
      type="button"
      aria-label={`${group.name} ${action}组合`}
      aria-expanded={!group.isCollapsed}
      title={`${action}组合`}
      data-cc-tooltip={`${action}组合`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => void data.onToggleGroupCollapsed(group, !group.isCollapsed)}
    >
      {group.isCollapsed ? <GroupExpandIcon /> : <GroupCollapseIcon />}
      <span>{action}</span>
    </button>
  )
}

interface EditActionsProps {
  readonly canSave: boolean
  readonly formId: string
  readonly onCancel: () => void
}

function EditActions({ canSave, formId, onCancel }: EditActionsProps) {
  return (
    <div
      className="terminal-group-node__edit-actions nodrag"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        className="terminal-group-node__action terminal-group-node__action--primary"
        type="submit"
        form={formId}
        aria-label="保存组合名称"
        title="保存组合名称"
        data-cc-tooltip="保存组合名称"
        disabled={!canSave}
      >
        <Check size={15} aria-hidden="true" />
      </button>
      <button
        className="terminal-group-node__action"
        type="button"
        aria-label="取消编辑组合名称"
        title="取消"
        data-cc-tooltip="取消"
        onClick={onCancel}
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  )
}

interface IconButtonProps {
  readonly label: string
  readonly title: string
  readonly tone?: 'primary' | 'danger'
  readonly surface?: 'raised'
  readonly disabled?: boolean
  readonly onClick: () => void
  readonly children: ReactNode
}

function IconButton({
  label,
  title,
  tone,
  surface,
  disabled = false,
  onClick,
  children
}: IconButtonProps) {
  return (
    <button
      className={['terminal-group-node__action', tone ? `terminal-group-node__action--${tone}` : '']
        .filter(Boolean)
        .join(' ')}
      type="button"
      aria-label={label}
      data-control-surface={surface}
      title={title}
      data-cc-tooltip={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

interface MemberRowProps {
  readonly block: TerminalBlockSnapshot
  readonly state: TerminalViewState | undefined
  readonly onRemove: () => void
}

function MemberRow({ block, state, onRemove }: MemberRowProps) {
  const status = state?.status ?? 'idle'

  return (
    <div className={`terminal-group-node__member terminal-group-node__member--${status}`}>
      <span className="terminal-group-node__member-status" aria-hidden="true" />
      <span className="terminal-group-node__member-name" title={block.name}>
        {block.name}
      </span>
      <span className="terminal-group-node__member-status-label">
        {terminalStatusLabels[status]}
      </span>
      <button
        className="terminal-group-node__member-remove nodrag"
        type="button"
        aria-label={`${block.name} 移出组合`}
        data-cc-tooltip="移出组合"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onRemove}
      >
        <GroupMemberUnlinkIcon />
      </button>
    </div>
  )
}

const terminalStatusLabels: Record<TerminalViewState['status'], string> = {
  idle: '未启动',
  running: '运行中',
  exited: '已退出',
  failed: '失败'
}

function getDropFeedbackLabel(
  feedback: NonNullable<TerminalGroupFlowNode['data']['dropFeedback']>
) {
  if (feedback === 'join') {
    return '松开加入组合'
  }

  if (feedback === 'leave') {
    return '松开移出组合'
  }

  return '松开后解散组合'
}
