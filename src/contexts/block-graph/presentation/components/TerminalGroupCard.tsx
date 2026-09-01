import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEventHandler,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  type RefCallback
} from 'react'

import type {
  TerminalBlockSnapshot,
  TerminalGroupSnapshot
} from '../../application/dto/BlockGraphSnapshot'
import type { UpdateTerminalGroupMetadataInput } from '../../domain/aggregates/BlockGraphTypes'
import {
  GroupAddIcon,
  GroupCancelIcon,
  GroupCollapseIcon,
  GroupContentsIcon,
  GroupDissolveIcon,
  GroupExpandIcon,
  GroupMemberUnlinkIcon,
  GroupRenameIcon,
  GroupRestartIcon,
  GroupSaveIcon,
  GroupSavingIcon,
  GroupStartIcon,
  GroupStopIcon
} from './TerminalGroupIcons'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import { TooltipLabel } from '../../../../presentation/shared/components/Tooltip'
import type { TerminalGroupDropFeedback } from '../view-models/TerminalGroupPresentationTypes'

interface TerminalGroupCardData {
  readonly dropFeedback: TerminalGroupDropFeedback | null
  readonly group: TerminalGroupSnapshot
  readonly isEditing?: boolean
  readonly onStartGroup: (group: TerminalGroupSnapshot) => void
  readonly onStopGroup: (group: TerminalGroupSnapshot) => void
  readonly onRestartGroup: (group: TerminalGroupSnapshot) => void
  readonly onUpdateGroupMetadata: (
    group: TerminalGroupSnapshot,
    metadata: UpdateTerminalGroupMetadataInput
  ) => Promise<void>
  readonly onToggleGroupCollapsed: (
    group: TerminalGroupSnapshot,
    isCollapsed: boolean
  ) => Promise<void>
  readonly onEditGroup?: (group: TerminalGroupSnapshot) => void
  readonly onDissolveGroup: (group: TerminalGroupSnapshot) => Promise<void>
}

export interface TerminalGroupCardProps {
  readonly data: TerminalGroupCardData
  readonly isContextSelected?: boolean
  readonly isExpanding?: boolean
  readonly isPending?: boolean
  readonly leadingContent?: ReactNode
  readonly memberRows?: ReactNode
  readonly selectionContent?: ReactNode
  readonly surfaceClassName?: string
  readonly surfaceRef?: RefCallback<HTMLElement>
  readonly surfaceStyle?: CSSProperties
  readonly onSurfaceAnimationEnd?: AnimationEventHandler<HTMLElement>
}

export function TerminalGroupCard({
  data,
  isContextSelected = false,
  isExpanding = false,
  isPending = false,
  leadingContent,
  memberRows,
  selectionContent,
  surfaceClassName,
  surfaceRef,
  surfaceStyle,
  onSurfaceAnimationEnd
}: TerminalGroupCardProps) {
  const { t } = useI18n()
  const group = data.group
  const [isEditingName, setIsEditingName] = useState(false)
  const [isSavingName, setIsSavingName] = useState(false)
  const [draftName, setDraftName] = useState(group.name)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const trimmedDraftName = draftName.trim()
  const nameFormId = `terminal-group-name-form-${group.id}`
  const className = [
    'terminal-group-node',
    surfaceClassName,
    group.isCollapsed ? 'terminal-group-node--collapsed' : '',
    data.isEditing ? 'terminal-group-node--editing' : '',
    isContextSelected ? 'terminal-group-node--context-selected' : '',
    data.dropFeedback ? `terminal-group-node--drop-${data.dropFeedback}` : ''
  ]
    .filter(Boolean)
    .join(' ')

  const saveName = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      if (!trimmedDraftName || isSavingName) {
        return
      }

      setIsSavingName(true)
      try {
        await data.onUpdateGroupMetadata(group, { name: trimmedDraftName })
        setIsEditingName(false)
      } finally {
        setIsSavingName(false)
      }
    },
    [data, group, isSavingName, trimmedDraftName]
  )

  const startEditingName = useCallback(() => {
    setDraftName(group.name)
    setIsSavingName(false)
    setIsEditingName(true)
  }, [group.name])

  const cancelEditingName = useCallback(() => {
    setDraftName(group.name)
    setIsEditingName(false)
  }, [group.name])

  useLayoutEffect(() => {
    if (!isEditingName) return
    nameInputRef.current?.focus()
    nameInputRef.current?.select()
  }, [isEditingName])

  return (
    <section
      ref={surfaceRef}
      className={className}
      data-terminal-group-id={group.id}
      data-context-selected={isContextSelected || undefined}
      aria-hidden={isPending || undefined}
      inert={isPending || undefined}
      style={surfaceStyle}
      onAnimationEnd={onSurfaceAnimationEnd}
    >
      <div className="terminal-group-node__material" aria-hidden="true" />
      {leadingContent}
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
              aria-busy={isSavingName}
              onSubmit={saveName}
              onKeyDown={(event) => {
                if (event.key !== 'Escape' || isSavingName) return
                event.preventDefault()
                event.stopPropagation()
                cancelEditingName()
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <input
                aria-label={t('group.name')}
                ref={nameInputRef}
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
              />
            </form>
          ) : (
            <TooltipLabel content={group.name}>
              <strong className="terminal-group-node__name">{group.name}</strong>
            </TooltipLabel>
          )}
        </div>

        {isEditingName ? (
          group.isCollapsed ? null : (
            <EditActions
              formId={nameFormId}
              canSave={Boolean(trimmedDraftName)}
              isSaving={isSavingName}
              onCancel={cancelEditingName}
            />
          )
        ) : group.isCollapsed ? (
          <DisclosureButton data={data} />
        ) : (
          <GroupActionToolbar data={data} isInline onRename={startEditingName} />
        )}
      </div>

      {group.isCollapsed ? (
        isEditingName ? (
          <div className="terminal-group-node__toolbar terminal-group-node__toolbar--editing">
            <EditActions
              formId={nameFormId}
              canSave={Boolean(trimmedDraftName)}
              isSaving={isSavingName}
              onCancel={cancelEditingName}
            />
          </div>
        ) : (
          <GroupActionToolbar data={data} onRename={startEditingName} />
        )
      ) : null}

      {group.isCollapsed ? (
        <div className="terminal-group-node__members">{memberRows}</div>
      ) : isExpanding ? (
        <div
          className="terminal-group-node__members terminal-group-node__members--motion-exit"
          aria-hidden="true"
          inert
        >
          {memberRows}
        </div>
      ) : null}
      {!group.isCollapsed && group.memberBlockIds.length === 0 ? (
        data.isEditing ? null : (
          <button
            className="terminal-group-node__empty-state terminal-group-node__empty-state--action nodrag"
            type="button"
            aria-label={t('group.namedAction', {
              groupName: group.name,
              action: t('group.action.addContents')
            })}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => data.onEditGroup?.(group)}
          >
            <GroupAddIcon size={20} />
            <span>{t('group.action.addContents')}</span>
          </button>
        )
      ) : null}
      {selectionContent}
    </section>
  )
}

interface GroupActionToolbarProps {
  readonly data: TerminalGroupCardData
  readonly isInline?: boolean
  readonly onRename: () => void
}

function GroupActionToolbar({ data, isInline = false, onRename }: GroupActionToolbarProps) {
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
          tooltip={t('group.action.start')}
          tone="primary"
          surface="raised"
          disabled={group.memberBlockIds.length === 0}
          onClick={() => data.onStartGroup(group)}
        >
          <GroupStartIcon />
        </IconButton>
        <IconButton
          label={t('group.namedAction', {
            groupName: group.name,
            action: t('group.action.stop')
          })}
          tooltip={t('group.action.stop')}
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
          tooltip={t('group.action.restartDescription')}
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
            action: t('group.action.manageContents')
          })}
          tooltip={t('group.action.manageContents')}
          surface="raised"
          pressed={data.isEditing}
          onClick={() => data.onEditGroup?.(group)}
        >
          <GroupContentsIcon />
        </IconButton>
        <IconButton
          label={t('group.namedAction', {
            groupName: group.name,
            action: t('group.action.rename')
          })}
          tooltip={t('group.action.rename')}
          surface="raised"
          onClick={onRename}
        >
          <GroupRenameIcon />
        </IconButton>
        {isInline ? <DisclosureButton data={data} /> : null}
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
          tooltip={t('group.action.dissolveDescription')}
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
  readonly data: TerminalGroupCardData
}

function DisclosureButton({ data }: DisclosureButtonProps) {
  const group = data.group
  const { t } = useI18n()
  const action = group.isCollapsed ? t('group.action.expand') : t('group.action.collapse')
  const groupAction = group.isCollapsed
    ? t('group.action.expandGroup')
    : t('group.action.collapseGroup')

  return (
    <TooltipLabel content={groupAction}>
      <button
        className="terminal-group-node__disclosure nodrag"
        type="button"
        aria-label={t('group.namedAction', { groupName: group.name, action: groupAction })}
        aria-expanded={!group.isCollapsed}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => void data.onToggleGroupCollapsed(group, !group.isCollapsed)}
      >
        {group.isCollapsed ? <GroupExpandIcon /> : <GroupCollapseIcon />}
        <span>{action}</span>
      </button>
    </TooltipLabel>
  )
}

interface EditActionsProps {
  readonly canSave: boolean
  readonly formId: string
  readonly isSaving: boolean
  readonly onCancel: () => void
}

function EditActions({ canSave, formId, isSaving, onCancel }: EditActionsProps) {
  const { t } = useI18n()
  return (
    <div
      className="terminal-group-node__edit-actions nodrag"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <TooltipLabel content={t('group.action.saveName')}>
        <button
          className="terminal-group-node__action terminal-group-node__action--primary"
          type="submit"
          form={formId}
          aria-label={t('group.action.saveName')}
          aria-busy={isSaving}
          disabled={!canSave || isSaving}
        >
          {isSaving ? (
            <GroupSavingIcon className="terminal-group-node__saving-indicator" size={15} />
          ) : (
            <GroupSaveIcon size={15} />
          )}
        </button>
      </TooltipLabel>
      <TooltipLabel content={t('common.cancel')}>
        <button
          className="terminal-group-node__action"
          type="button"
          aria-label={t('group.action.cancelEditName')}
          disabled={isSaving}
          onClick={onCancel}
        >
          <GroupCancelIcon size={15} />
        </button>
      </TooltipLabel>
    </div>
  )
}

interface IconButtonProps {
  readonly label: string
  readonly tooltip: string
  readonly tone?: 'primary' | 'danger'
  readonly surface?: 'raised'
  readonly disabled?: boolean
  readonly pressed?: boolean
  readonly onClick: () => void
  readonly children: ReactNode
}

function IconButton({
  label,
  tooltip,
  tone,
  surface,
  disabled = false,
  pressed,
  onClick,
  children
}: IconButtonProps) {
  return (
    <TooltipLabel content={tooltip}>
      <button
        className={[
          'terminal-group-node__action',
          tone ? `terminal-group-node__action--${tone}` : ''
        ]
          .filter(Boolean)
          .join(' ')}
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        data-control-surface={surface}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </button>
    </TooltipLabel>
  )
}

interface TerminalGroupMemberRowProps {
  readonly block: TerminalBlockSnapshot
  readonly status: string
  readonly statusLabel: string
  readonly onRemove: () => void
}

export function TerminalGroupMemberRow({
  block,
  status,
  statusLabel,
  onRemove
}: TerminalGroupMemberRowProps) {
  const { t } = useI18n()

  return (
    <div className={`terminal-group-node__member terminal-group-node__member--${status}`}>
      <span className="terminal-group-node__member-status" aria-hidden="true" />
      <TooltipLabel content={block.name}>
        <span className="terminal-group-node__member-name">{block.name}</span>
      </TooltipLabel>
      <span className="terminal-group-node__member-status-label">{statusLabel}</span>
      <TooltipLabel content={t('group.action.removeMember')}>
        <button
          className="terminal-group-node__member-remove nodrag"
          type="button"
          aria-label={t('group.memberNamedAction', {
            blockName: block.name,
            action: t('group.action.removeMember')
          })}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onRemove}
        >
          <GroupMemberUnlinkIcon />
        </button>
      </TooltipLabel>
    </div>
  )
}
