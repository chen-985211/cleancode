import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Check, X } from 'lucide-react'
import { memo, useCallback, useState, type FormEvent, type ReactNode } from 'react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  agentApprovalConnectionSourceHandleId,
  agentApprovalConnectionTargetHandleId,
  agentApprovalTargetHandleId
} from './agentApprovalHandles'
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
import { useI18n } from './i18n/useI18n'

export const TerminalGroupNode = memo(function TerminalGroupNode({
  data
}: NodeProps<TerminalGroupFlowNode>) {
  const { t } = useI18n()
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
        id={agentApprovalConnectionSourceHandleId}
        className="agent-approval-intent-handle agent-approval-connection-handle--source"
        type="source"
        position={Position.Right}
        isConnectable={false}
      />
      <Handle
        id={agentApprovalConnectionTargetHandleId}
        className="agent-approval-intent-handle agent-approval-connection-handle--target"
        type="target"
        position={Position.Left}
        isConnectable={false}
      />
      <Handle
        id={agentApprovalTargetHandleId}
        className="agent-approval-intent-handle agent-approval-intent-handle--target"
        type="target"
        position={Position.Left}
        isConnectable={false}
      />
      {data.approvalIntent === 'contains-delete' ? (
        <span className="agent-approval-target-chip">{t('group.containsDelete')}</span>
      ) : data.approvalIntent === 'contains-disconnect' ? (
        <span className="agent-approval-target-chip">{t('group.containsDisconnect')}</span>
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
                aria-label={t('group.name')}
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
                  {getDropFeedbackLabel(data.dropFeedback, t)}
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
  const { t } = useI18n()

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
          label={t('group.namedAction', {
            groupName: group.name,
            action: t('group.action.start')
          })}
          title={t('group.action.start')}
          tone="primary"
          surface="raised"
          onClick={() => data.onStartGroup(group)}
        >
          <GroupStartIcon />
        </IconButton>
        <IconButton
          label={t('group.namedAction', {
            groupName: group.name,
            action: t('group.action.stop')
          })}
          title={t('group.action.stop')}
          surface="raised"
          onClick={() => data.onStopGroup(group)}
        >
          <GroupStopIcon />
        </IconButton>
        <IconButton
          label={t('group.namedAction', {
            groupName: group.name,
            action: t('group.action.restart')
          })}
          title={t('group.action.restartDescription')}
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
          label={t('group.namedAction', {
            groupName: group.name,
            action: t('group.action.edit')
          })}
          title={t('group.action.edit')}
          surface="raised"
          onClick={onEdit}
        >
          <GroupEditIcon />
        </IconButton>
        {isInline ? <DisclosureButton data={data} /> : null}
        <div className="terminal-group-node__membership-actions" data-control-group="membership">
          <IconButton
            label={t('group.namedAction', {
              groupName: group.name,
              action: t('group.action.addSelected')
            })}
            title={t('group.action.addSelected')}
            disabled={data.selectedUngroupedTerminalBlockIds.length === 0}
            onClick={() => void data.onAddSelectedTerminalsToGroup(group)}
          >
            <GroupAddIcon />
          </IconButton>
          <IconButton
            label={t('group.namedAction', {
              groupName: group.name,
              action: t('group.action.removeSelected')
            })}
            title={t('group.action.removeSelected')}
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
          label={t('group.namedAction', {
            groupName: group.name,
            action: t('group.action.dissolve')
          })}
          title={t('group.action.dissolveDescription')}
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
  const { t } = useI18n()
  const action = group.isCollapsed ? t('group.action.expand') : t('group.action.collapse')
  const groupAction = group.isCollapsed
    ? t('group.action.expandGroup')
    : t('group.action.collapseGroup')

  return (
    <button
      className="terminal-group-node__disclosure nodrag"
      type="button"
      aria-label={t('group.namedAction', { groupName: group.name, action: groupAction })}
      aria-expanded={!group.isCollapsed}
      title={groupAction}
      data-cc-tooltip={groupAction}
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
  const { t } = useI18n()
  return (
    <div
      className="terminal-group-node__edit-actions nodrag"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        className="terminal-group-node__action terminal-group-node__action--primary"
        type="submit"
        form={formId}
        aria-label={t('group.action.saveName')}
        title={t('group.action.saveName')}
        data-cc-tooltip={t('group.action.saveName')}
        disabled={!canSave}
      >
        <Check size={15} aria-hidden="true" />
      </button>
      <button
        className="terminal-group-node__action"
        type="button"
        aria-label={t('group.action.cancelEditName')}
        title={t('common.cancel')}
        data-cc-tooltip={t('common.cancel')}
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
  const { t } = useI18n()

  return (
    <div className={`terminal-group-node__member terminal-group-node__member--${status}`}>
      <span className="terminal-group-node__member-status" aria-hidden="true" />
      <span className="terminal-group-node__member-name" title={block.name}>
        {block.name}
      </span>
      <span className="terminal-group-node__member-status-label">
        {t(`terminal.status.${status}`)}
      </span>
      <button
        className="terminal-group-node__member-remove nodrag"
        type="button"
        aria-label={t('group.memberNamedAction', {
          blockName: block.name,
          action: t('group.action.removeMember')
        })}
        data-cc-tooltip={t('group.action.removeMember')}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onRemove}
      >
        <GroupMemberUnlinkIcon />
      </button>
    </div>
  )
}

function getDropFeedbackLabel(
  feedback: NonNullable<TerminalGroupFlowNode['data']['dropFeedback']>,
  t: ReturnType<typeof useI18n>['t']
) {
  if (feedback === 'join') {
    return t('group.dropJoin')
  }

  if (feedback === 'leave') {
    return t('group.dropLeave')
  }

  return t('group.dropDissolve')
}
