import {
  Handle,
  Position,
  type NodeProps,
  type ResizeDragEvent,
  type ResizeParams
} from '@xyflow/react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'

import { TerminalMetadataForm } from '../../contexts/block-graph/presentation/components/TerminalMetadataForm'
import type { TerminalExecutionConfigSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalBlockMetadataInput } from '../../contexts/block-graph/presentation/view-models/TerminalDefinitionPresentationTypes'
import { agentApprovalTargetHandleId } from './agentApprovalHandles'
import {
  TerminalRuntimeActions,
  TerminalWorkflowStatusBadge,
  type TerminalRuntimeActionsProps
} from '../../contexts/run/presentation/components/TerminalRuntimeHeader'
import { TerminalServiceRuntimeBar } from '../../contexts/run/presentation/components/TerminalServiceRuntimeBar'
import { TerminalViewport } from './TerminalViewport'
import { TooltipLabel } from '../shared/components/Tooltip'
import { WorkbenchNodeResizer } from './WorkbenchNodeResizer'
import { WorkbenchNodeSelectionVeil } from './WorkbenchNodeSelectionVeil'
import { terminalNodeMinimumSize } from './types/terminalFlowNode'
import type { TerminalDimensions } from '../../contexts/run/presentation/view-models/TerminalPresentationTypes'
import type { TerminalFlowNode } from './types/terminalFlowNode'
import type { WorkbenchNodeLayoutInput } from './types/workbenchNodeLayout'
import { useI18n } from '../i18n/useI18n'
import { useWorkbenchObjectMotionPresentation } from './useWorkbenchObjectMotionPresentation'
import { WorkbenchIcon } from '../shared/components/WorkbenchIcons'
import { useTerminalState } from '../../contexts/run/presentation/view-models/terminalStateStore'

export const TerminalNode = memo(function TerminalNode({ data }: NodeProps<TerminalFlowNode>) {
  const block = data.block
  const isParked = Boolean(data.isParkedInCollapsedGroup && !data.objectMotion)
  const session = useTerminalState(data.terminalStateStore, block.id, data.session, !isParked)
  const isRunning = session.status === 'running'
  const isDisclosureExit = data.objectMotion?.kind === 'group-collapse'
  const isPresenceMotion =
    data.objectMotion?.kind === 'create' || data.objectMotion?.kind === 'delete'
  const isPresenceExit = data.objectMotion?.kind === 'delete'
  const isPresencePending = data.objectPresence?.phase === 'pending'
  const isInteractionSuppressed =
    isDisclosureExit || isPresenceExit || isPresencePending || isParked
  const [isEditingMetadata, setIsEditingMetadata] = useState(false)
  const [shouldFocusLaunchCommand, setShouldFocusLaunchCommand] = useState(false)
  const [focusRequestId, setFocusRequestId] = useState(0)
  const [isResizingBlock, setIsResizingBlock] = useState(false)
  const metadataFormId = `terminal-metadata-form-${block.id}`
  const hasRequestedAutoStartRef = useRef(false)
  const lastLaunchCommandEditRequestIdRef = useRef<number | undefined>(undefined)
  const lastDimensionsRef = useRef<TerminalDimensions | null>(null)
  const {
    className: objectMotionClassName,
    onAnimationEnd: onObjectMotionAnimationEnd,
    style: objectMotionStyle,
    surfaceRef: objectMotionSurfaceRef
  } = useWorkbenchObjectMotionPresentation(data.objectMotion, data.onObjectMotionComplete)

  const terminalNodeClassName = [
    'terminal-node',
    isPresenceMotion ? '' : objectMotionClassName,
    isRunning ? 'terminal-node--running' : '',
    data.isSelected ? 'terminal-node--selected' : '',
    data.isContextSelected ? 'terminal-node--context-selected' : '',
    data.isTerminalGroupSelectionMode ? 'terminal-node--group-selection-mode' : '',
    data.isTerminalGroupSelectionMode && data.isSelected
      ? 'terminal-node--group-candidate-selected'
      : '',
    data.isNavigationHighlighted ? 'terminal-node--navigation-highlighted' : ''
  ]
    .filter(Boolean)
    .join(' ')
  const terminalAnchorClassName = [
    'terminal-node-anchor',
    isPresenceMotion ? objectMotionClassName : '',
    isPresencePending ? 'workbench-object-presence--pending' : '',
    isParked ? 'terminal-node-anchor--parked' : '',
    data.isSelected ? 'terminal-node-anchor--selected' : '',
    data.isSelected ? 'terminal-node--selected' : '',
    data.approvalIntent ? 'terminal-node--approval-target' : ''
  ]
    .filter(Boolean)
    .join(' ')

  const handleDimensionsChange = useCallback(
    (dimensions: TerminalDimensions) => {
      lastDimensionsRef.current = dimensions
      if (isInteractionSuppressed) return

      if (session.status === 'running') {
        data.onResize(block, dimensions)
        return
      }

      if (
        session.status === 'idle' &&
        !session.sessionId &&
        !session.isRecoveryPending &&
        !hasRequestedAutoStartRef.current
      ) {
        hasRequestedAutoStartRef.current = true
        data.onStart(block, dimensions)
      }
    },
    [
      block,
      data,
      isInteractionSuppressed,
      session.isRecoveryPending,
      session.sessionId,
      session.status
    ]
  )

  useEffect(() => {
    if (session.isRecoveryPending) {
      hasRequestedAutoStartRef.current = false
    }
  }, [session.isRecoveryPending])

  useEffect(() => {
    if (isInteractionSuppressed) return
    if (
      session.status === 'idle' &&
      !session.sessionId &&
      !session.isRecoveryPending &&
      !hasRequestedAutoStartRef.current
    ) {
      const dimensions = lastDimensionsRef.current

      if (!dimensions) {
        return
      }

      hasRequestedAutoStartRef.current = true
      data.onStart(block, dimensions)
    }
  }, [
    block,
    data,
    isInteractionSuppressed,
    session.isRecoveryPending,
    session.sessionId,
    session.status
  ])

  const startEditingMetadata = useCallback(() => {
    setShouldFocusLaunchCommand(false)
    setIsEditingMetadata(true)
  }, [])

  const startEditingLaunchCommand = useCallback(() => {
    setShouldFocusLaunchCommand(true)
    setIsEditingMetadata(true)
  }, [])

  useEffect(() => {
    const requestId = data.launchCommandEditRequestId
    if (requestId === undefined || requestId === lastLaunchCommandEditRequestIdRef.current) return

    lastLaunchCommandEditRequestIdRef.current = requestId
    startEditingLaunchCommand()
  }, [data.launchCommandEditRequestId, startEditingLaunchCommand])

  const requestTerminalFocus = useCallback(() => {
    setFocusRequestId((currentFocusRequestId) => currentFocusRequestId + 1)
  }, [])

  const stopTerminal = useCallback(() => {
    data.onStop(block)
    requestTerminalFocus()
  }, [block, data, requestTerminalFocus])

  const restartTerminal = useCallback(() => {
    data.onRestart(block)
    requestTerminalFocus()
  }, [block, data, requestTerminalFocus])

  const quickLaunchTerminal = useCallback(() => {
    if (!block.launchCommand.trim()) {
      startEditingLaunchCommand()
      return
    }

    data.onQuickLaunch(block)
    requestTerminalFocus()
  }, [block, data, requestTerminalFocus, startEditingLaunchCommand])

  const resizeTerminalBlock = useCallback(
    (_event: ResizeDragEvent, layout: ResizeParams) => {
      setIsResizingBlock(false)
      void data.onResizeBlock(block, toWorkbenchNodeLayoutInput(layout))
    },
    [block, data]
  )

  const saveMetadata = useCallback(
    async (
      metadata: TerminalBlockMetadataInput,
      executionConfig: TerminalExecutionConfigSnapshot
    ) => {
      await data.onUpdateDefinition(block, { ...metadata, executionConfig })
      setShouldFocusLaunchCommand(false)
      setIsEditingMetadata(false)
    },
    [block, data]
  )

  return (
    <div
      ref={isPresenceMotion ? objectMotionSurfaceRef : undefined}
      className={terminalAnchorClassName}
      style={isPresenceMotion ? objectMotionStyle : undefined}
      onAnimationEnd={isPresenceMotion ? onObjectMotionAnimationEnd : undefined}
      data-terminal-block-id={block.id}
      data-terminal-auto-start-status={
        session.sessionId
          ? 'succeeded'
          : session.isRecoveryPending
            ? 'idle'
            : (session.autoStartStatus ?? 'idle')
      }
      data-context-selected={data.isContextSelected || undefined}
      data-terminal-parked={data.isParkedInCollapsedGroup || undefined}
      aria-hidden={isInteractionSuppressed || undefined}
      inert={isInteractionSuppressed || undefined}
    >
      <WorkbenchNodeResizer
        isVisible={!data.isTerminalGroupSelectionMode}
        minWidth={terminalNodeMinimumSize.width}
        minHeight={terminalNodeMinimumSize.height}
        className="terminal-node__resize-handle nodrag"
        onResizeStart={() => setIsResizingBlock(true)}
        onResizeEnd={resizeTerminalBlock}
      />
      <Handle
        className="terminal-node__handle terminal-node__handle--input"
        type="target"
        position={Position.Left}
      />
      <Handle
        id={agentApprovalTargetHandleId}
        className="agent-approval-intent-handle agent-approval-intent-handle--target"
        type="target"
        position={Position.Left}
        isConnectable={false}
      />
      <section
        ref={isPresenceMotion ? undefined : objectMotionSurfaceRef}
        className={terminalNodeClassName}
        style={isPresenceMotion ? undefined : objectMotionStyle}
        onAnimationEnd={isPresenceMotion ? undefined : onObjectMotionAnimationEnd}
      >
        <TerminalHeader
          blockName={block.name}
          blockDescription={block.description}
          canQuickLaunch={block.launchCommand.trim().length > 0}
          metadataFormId={metadataFormId}
          isEditingMetadata={isEditingMetadata}
          isRunning={isRunning}
          isRecoveryPending={Boolean(session.isRecoveryPending)}
          isTerminalGroupSelectionMode={data.isTerminalGroupSelectionMode}
          isSelectedForTerminalGroup={data.isSelected}
          canSelectForTerminalGroup={data.canSelectForTerminalGroup}
          sessionKind={session.sessionKind ?? null}
          retentionPolicy={session.retentionPolicy ?? 'terminate-on-application-exit'}
          workflowStatus={data.workflowStatus}
          isActiveWorkflowRoot={Boolean(data.isActiveWorkflowRoot)}
          isStoppingWorkflow={Boolean(data.isStoppingWorkflow)}
          onSelect={() => data.onSelect?.(block)}
          onToggleTerminalGroupCandidate={() => data.onToggleTerminalGroupCandidate(block)}
          onStartEditing={startEditingMetadata}
          onStop={stopTerminal}
          onQuickLaunch={quickLaunchTerminal}
          onRestart={restartTerminal}
          onToggleRetention={() => data.onToggleRetention?.(block)}
          onRunFromHere={() => data.onRunFromHere?.(block)}
          onStopWorkflow={() => data.onStopWorkflow?.()}
          onDelete={() => data.onDelete(block)}
        />
        {isEditingMetadata ? (
          <TerminalMetadataForm
            block={block}
            formId={metadataFormId}
            shouldFocusLaunchCommand={shouldFocusLaunchCommand}
            onSave={saveMetadata}
            onCancel={() => {
              setShouldFocusLaunchCommand(false)
              setIsEditingMetadata(false)
            }}
          />
        ) : null}
        <TerminalServiceRuntimeBar
          identity={session.runIdentity ?? null}
          endpoint={session.actualEndpoint ?? null}
          portState={session.servicePortState ?? null}
          conflict={session.portConflict ?? null}
          onCopyEndpoint={async (endpoint) => {
            if (data.onCopyServiceEndpoint) {
              await data.onCopyServiceEndpoint(endpoint)
              return
            }

            await window.navigator.clipboard?.writeText(endpoint.displayAddress)
          }}
          onOpenEndpoint={(identity) => data.onOpenServiceEndpoint?.(identity)}
          onLocateOwner={(owner) => data.onLocateManagedServiceOwner?.(owner)}
          onEditPortConfiguration={startEditingMetadata}
          onDismissConflict={() => {
            if (session.runIdentity) data.onDismissPortConflict?.(session.runIdentity)
          }}
        />
        <div className="terminal-frame">
          <TerminalViewport
            key={session.sessionId ?? 'idle'}
            block={block}
            session={session}
            focusRequestId={focusRequestId}
            isResizeSuspended={isResizingBlock}
            isInputDisabled={session.status !== 'running' || Boolean(session.isRecoveryPending)}
            onViewIdentityStale={data.onViewIdentityStale}
            onRestart={restartTerminal}
            onDimensionsChange={handleDimensionsChange}
            onInput={data.onInput}
            onPaste={data.onPaste}
          />
        </div>
        {data.isSelected || data.isContextSelected ? <WorkbenchNodeSelectionVeil /> : null}
      </section>
      <Handle
        className="terminal-node__handle terminal-node__handle--output"
        type="source"
        position={Position.Right}
      />
    </div>
  )
})

function toWorkbenchNodeLayoutInput(layout: ResizeParams): WorkbenchNodeLayoutInput {
  return {
    position: { x: Math.round(layout.x), y: Math.round(layout.y) },
    size: { width: Math.round(layout.width), height: Math.round(layout.height) }
  }
}

interface TerminalHeaderProps {
  readonly blockName: string
  readonly blockDescription: string
  readonly canQuickLaunch: boolean
  readonly metadataFormId: string
  readonly isEditingMetadata: boolean
  readonly isRunning: boolean
  readonly isRecoveryPending: boolean
  readonly isTerminalGroupSelectionMode: boolean
  readonly isSelectedForTerminalGroup: boolean
  readonly canSelectForTerminalGroup: boolean
  readonly sessionKind: TerminalRuntimeActionsProps['sessionKind']
  readonly retentionPolicy: TerminalRuntimeActionsProps['retentionPolicy']
  readonly workflowStatus: TerminalFlowNode['data']['workflowStatus']
  readonly isActiveWorkflowRoot: boolean
  readonly isStoppingWorkflow: boolean
  readonly onSelect: () => void
  readonly onToggleTerminalGroupCandidate: () => void
  readonly onStartEditing: () => void
  readonly onStop: () => void
  readonly onQuickLaunch: () => void
  readonly onRestart: () => void
  readonly onToggleRetention: () => void
  readonly onRunFromHere: () => void
  readonly onStopWorkflow: () => void
  readonly onDelete: () => void
}

function TerminalHeader({
  blockName,
  blockDescription,
  canQuickLaunch,
  metadataFormId,
  isEditingMetadata,
  isRunning,
  isRecoveryPending,
  isTerminalGroupSelectionMode,
  isSelectedForTerminalGroup,
  canSelectForTerminalGroup,
  sessionKind,
  retentionPolicy,
  workflowStatus,
  isActiveWorkflowRoot,
  isStoppingWorkflow,
  onSelect,
  onToggleTerminalGroupCandidate,
  onStartEditing,
  onStop,
  onQuickLaunch,
  onRestart,
  onToggleRetention,
  onRunFromHere,
  onStopWorkflow,
  onDelete
}: TerminalHeaderProps) {
  const { t } = useI18n()
  const terminalGroupSelectionLabel = isSelectedForTerminalGroup
    ? t('terminal.action.selected')
    : t('terminal.action.select')
  return (
    <div className="terminal-node__header" onClick={() => onSelect()}>
      <span className="terminal-node__icon">
        <WorkbenchIcon size={19} data-icon="terminal-node" role="terminal" />
      </span>
      {isTerminalGroupSelectionMode ? (
        <TooltipLabel content={terminalGroupSelectionLabel}>
          <button
            className={[
              'terminal-node__group-select nodrag',
              isSelectedForTerminalGroup ? 'terminal-node__group-select--selected' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            type="button"
            aria-pressed={isSelectedForTerminalGroup}
            aria-label={t('terminal.namedAction', {
              blockName,
              action: terminalGroupSelectionLabel
            })}
            disabled={!canSelectForTerminalGroup}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onToggleTerminalGroupCandidate()
            }}
          >
            <WorkbenchIcon
              role={isSelectedForTerminalGroup ? 'confirm' : 'group-add'}
              size={isSelectedForTerminalGroup ? 16 : 15}
            />
          </button>
        </TooltipLabel>
      ) : null}
      <div className="terminal-node__title">
        <strong>{blockName}</strong>
        <div className="terminal-node__meta">
          <span className="terminal-node__description">{blockDescription}</span>
          <TerminalWorkflowStatusBadge status={workflowStatus} />
        </div>
      </div>
      <div
        className="terminal-node__actions nodrag"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <TerminalRuntimeActions
          terminalName={blockName}
          canQuickLaunch={canQuickLaunch}
          isRunning={isRunning}
          isRecoveryPending={isRecoveryPending}
          sessionKind={sessionKind}
          retentionPolicy={retentionPolicy}
          isActiveWorkflowRoot={isActiveWorkflowRoot}
          isStoppingWorkflow={isStoppingWorkflow}
          onRunFromHere={onRunFromHere}
          onStopWorkflow={onStopWorkflow}
          onQuickLaunch={onQuickLaunch}
          onStop={onStop}
          onToggleRetention={onToggleRetention}
          onRestart={onRestart}
        />
        <span className="terminal-node__action-divider" aria-hidden="true" />
        <TooltipLabel content={t('terminal.action.edit')}>
          <button
            className={[
              'terminal-node__action',
              'terminal-node__action--edit',
              isEditingMetadata ? 'terminal-node__action--active' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            type="button"
            aria-label={t('terminal.namedAction', {
              blockName,
              action: t('terminal.action.edit')
            })}
            aria-controls={metadataFormId}
            aria-expanded={isEditingMetadata}
            aria-pressed={isEditingMetadata}
            onClick={onStartEditing}
          >
            <WorkbenchIcon size={15} data-icon="terminal-edit" role="edit" />
          </button>
        </TooltipLabel>
        <TooltipLabel content={t('terminal.action.delete')}>
          <button
            className="terminal-node__action terminal-node__action--danger"
            type="button"
            aria-label={t('terminal.namedAction', {
              blockName,
              action: t('terminal.action.delete')
            })}
            onClick={onDelete}
          >
            <WorkbenchIcon size={15} data-icon="terminal-delete" role="delete" />
          </button>
        </TooltipLabel>
      </div>
    </div>
  )
}
