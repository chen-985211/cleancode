import {
  Handle,
  Position,
  type NodeProps,
  type ResizeDragEvent,
  type ResizeParams
} from '@xyflow/react'
import { Check, CircleStop, Edit3, Play, Square, Terminal, Waypoints, X } from 'lucide-react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'

import { GroupRestartIcon } from './TerminalGroupIcons'
import { TerminalMetadataForm } from './TerminalMetadataForm'
import type { TerminalExecutionConfigSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { agentApprovalTargetHandleId } from './agentApprovalHandles'
import { TerminalServiceRuntimeBar } from './TerminalServiceRuntimeBar'
import { TerminalViewport } from './TerminalViewport'
import { TooltipLabel } from './Tooltip'
import { WorkbenchNodeResizer } from './WorkbenchNodeResizer'
import { WorkbenchNodeSelectionVeil } from './WorkbenchNodeSelectionVeil'
import {
  terminalNodeMinimumSize,
  type TerminalDimensions,
  type TerminalBlockMetadataInput,
  type TerminalFlowNode,
  type TerminalViewState,
  type WorkbenchNodeLayoutInput
} from './types'
import { useI18n } from './i18n/useI18n'

export const TerminalNode = memo(function TerminalNode({ data }: NodeProps<TerminalFlowNode>) {
  const block = data.block
  const session = data.session
  const isRunning = session.status === 'running'
  const [isEditingMetadata, setIsEditingMetadata] = useState(false)
  const [shouldFocusLaunchCommand, setShouldFocusLaunchCommand] = useState(false)
  const [focusRequestId, setFocusRequestId] = useState(0)
  const [isResizingBlock, setIsResizingBlock] = useState(false)
  const hasRequestedAutoStartRef = useRef(false)
  const lastDimensionsRef = useRef<TerminalDimensions | null>(null)
  const terminalStateClassName =
    session.status === 'running'
      ? 'terminal-state terminal-state--running'
      : session.status === 'failed'
        ? 'terminal-state terminal-state--failed'
        : 'terminal-state'
  const terminalNodeClassName = [
    'terminal-node',
    isRunning ? 'terminal-node--running' : '',
    data.isSelected ? 'terminal-node--selected' : '',
    data.isTerminalGroupSelectionMode ? 'terminal-node--group-selection-mode' : '',
    data.isTerminalGroupSelectionMode && data.isSelected
      ? 'terminal-node--group-candidate-selected'
      : '',
    data.isNavigationHighlighted ? 'terminal-node--navigation-highlighted' : '',
    data.approvalIntent ? 'terminal-node--approval-target' : ''
  ]
    .filter(Boolean)
    .join(' ')

  const handleDimensionsChange = useCallback(
    (dimensions: TerminalDimensions) => {
      lastDimensionsRef.current = dimensions

      if (session.status === 'running') {
        data.onResize(block, dimensions)
        return
      }

      if (session.status === 'idle' && !session.sessionId && !hasRequestedAutoStartRef.current) {
        hasRequestedAutoStartRef.current = true
        data.onStart(block, dimensions)
      }
    },
    [block, data, session.sessionId, session.status]
  )

  useEffect(() => {
    if (session.status === 'idle' && !session.sessionId && !hasRequestedAutoStartRef.current) {
      const dimensions = lastDimensionsRef.current

      if (!dimensions) {
        return
      }

      hasRequestedAutoStartRef.current = true
      data.onStart(block, dimensions)
    }
  }, [block, data, session.sessionId, session.status])

  const startEditingMetadata = useCallback(() => {
    setShouldFocusLaunchCommand(false)
    setIsEditingMetadata(true)
  }, [])

  const startEditingLaunchCommand = useCallback(() => {
    setShouldFocusLaunchCommand(true)
    setIsEditingMetadata(true)
  }, [])

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
    <section className={terminalNodeClassName} data-terminal-block-id={block.id}>
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
      <TerminalHeader
        blockName={block.name}
        blockDescription={block.description}
        blockLaunchCommand={block.launchCommand}
        terminalStateClassName={terminalStateClassName}
        isRunning={isRunning}
        isTerminalGroupSelectionMode={data.isTerminalGroupSelectionMode}
        isSelectedForTerminalGroup={data.isSelected}
        canSelectForTerminalGroup={data.canSelectForTerminalGroup}
        sessionStatus={session.status}
        workflowStatus={data.workflowStatus}
        isActiveWorkflowRoot={Boolean(data.isActiveWorkflowRoot)}
        isStoppingWorkflow={Boolean(data.isStoppingWorkflow)}
        onSelect={(additive) => data.onSelect?.(additive)}
        onToggleTerminalGroupCandidate={() => data.onToggleTerminalGroupCandidate(block)}
        onStartEditing={startEditingMetadata}
        onStop={stopTerminal}
        onQuickLaunch={quickLaunchTerminal}
        onRestart={restartTerminal}
        onRunFromHere={() => data.onRunFromHere?.(block)}
        onStopWorkflow={() => data.onStopWorkflow?.()}
        onDelete={() => data.onDelete(block)}
      />
      {isEditingMetadata ? (
        <TerminalMetadataForm
          block={block}
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
          onDimensionsChange={handleDimensionsChange}
          onInput={data.onInput}
          onPaste={data.onPaste}
        />
      </div>
      <Handle
        className="terminal-node__handle terminal-node__handle--output"
        type="source"
        position={Position.Right}
      />
      {data.isSelected ? <WorkbenchNodeSelectionVeil /> : null}
    </section>
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
  readonly blockLaunchCommand: string
  readonly terminalStateClassName: string
  readonly isRunning: boolean
  readonly isTerminalGroupSelectionMode: boolean
  readonly isSelectedForTerminalGroup: boolean
  readonly canSelectForTerminalGroup: boolean
  readonly sessionStatus: TerminalViewState['status']
  readonly workflowStatus: TerminalFlowNode['data']['workflowStatus']
  readonly isActiveWorkflowRoot: boolean
  readonly isStoppingWorkflow: boolean
  readonly onSelect: (additive: boolean) => void
  readonly onToggleTerminalGroupCandidate: () => void
  readonly onStartEditing: () => void
  readonly onStop: () => void
  readonly onQuickLaunch: () => void
  readonly onRestart: () => void
  readonly onRunFromHere: () => void
  readonly onStopWorkflow: () => void
  readonly onDelete: () => void
}

function TerminalHeader({
  blockName,
  blockDescription,
  blockLaunchCommand,
  terminalStateClassName,
  isRunning,
  isTerminalGroupSelectionMode,
  isSelectedForTerminalGroup,
  canSelectForTerminalGroup,
  sessionStatus,
  workflowStatus,
  isActiveWorkflowRoot,
  isStoppingWorkflow,
  onSelect,
  onToggleTerminalGroupCandidate,
  onStartEditing,
  onStop,
  onQuickLaunch,
  onRestart,
  onRunFromHere,
  onStopWorkflow,
  onDelete
}: TerminalHeaderProps) {
  const { t } = useI18n()
  const canQuickLaunch = blockLaunchCommand.trim().length > 0
  const launchCommandState = canQuickLaunch ? 'configured' : 'unconfigured'
  const launchCommandTooltip = canQuickLaunch
    ? t('terminal.action.launch')
    : t('terminal.action.configureLaunch')
  const terminalGroupSelectionLabel = isSelectedForTerminalGroup
    ? t('terminal.action.selected')
    : t('terminal.action.select')
  const workflowActionLabel = isActiveWorkflowRoot
    ? isStoppingWorkflow
      ? t('terminal.action.stoppingWorkflow')
      : t('terminal.action.stopWorkflow')
    : t('terminal.action.runWorkflow')
  return (
    <div className="terminal-node__header" onClick={(event) => onSelect(event.shiftKey)}>
      <span className="terminal-node__icon">
        <Terminal size={19} aria-hidden="true" />
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
            {isSelectedForTerminalGroup ? <Check size={16} aria-hidden="true" /> : null}
          </button>
        </TooltipLabel>
      ) : null}
      <div className="terminal-node__title">
        <strong>{blockName}</strong>
        <div className="terminal-node__meta">
          <span className="terminal-node__description">{blockDescription}</span>
          <span className={terminalStateClassName}>
            {isRunning
              ? t('terminal.status.running')
              : sessionStatus === 'stopping'
                ? t('terminal.status.stopping')
                : sessionStatus === 'failed'
                  ? t('terminal.status.failed')
                  : sessionStatus === 'exited'
                    ? t('terminal.status.exited')
                    : t('terminal.status.idle')}
          </span>
          {workflowStatus ? (
            <span className={`workflow-state workflow-state--${workflowStatus}`}>
              {t(`workflow.status.${workflowStatus}`)}
            </span>
          ) : null}
        </div>
      </div>
      <div
        className="terminal-node__actions nodrag"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <TooltipLabel content={workflowActionLabel}>
          <button
            className={`terminal-node__action terminal-node__action--workflow${isActiveWorkflowRoot ? ' terminal-node__action--workflow-stop' : ''}`}
            type="button"
            aria-label={t('terminal.namedAction', {
              blockName,
              action: isActiveWorkflowRoot
                ? workflowActionLabel
                : t('terminal.action.runTerminalWorkflow')
            })}
            disabled={isActiveWorkflowRoot ? isStoppingWorkflow : !canQuickLaunch}
            onClick={isActiveWorkflowRoot ? onStopWorkflow : onRunFromHere}
          >
            {isActiveWorkflowRoot ? (
              <CircleStop size={15} aria-hidden="true" />
            ) : (
              <Waypoints size={15} aria-hidden="true" />
            )}
          </button>
        </TooltipLabel>
        <TooltipLabel content={launchCommandTooltip}>
          <button
            className={[
              'terminal-node__action',
              'terminal-node__action--launch',
              `terminal-node__action--launch-${launchCommandState}`
            ].join(' ')}
            type="button"
            aria-label={t('terminal.namedAction', {
              blockName,
              action: t('terminal.action.launch')
            })}
            data-launch-command-state={launchCommandState}
            onClick={onQuickLaunch}
          >
            <Play size={15} aria-hidden="true" />
          </button>
        </TooltipLabel>
        <TooltipLabel content={t('terminal.action.stopCommand')}>
          <button
            className="terminal-node__action"
            type="button"
            aria-label={t('terminal.namedAction', {
              blockName,
              action: t('terminal.action.stopCommand')
            })}
            disabled={!isRunning}
            onClick={onStop}
          >
            <Square size={14} aria-hidden="true" />
          </button>
        </TooltipLabel>
        <TooltipLabel content={t('terminal.action.restartEmptyDescription')}>
          <button
            className="terminal-node__action"
            type="button"
            aria-label={t('terminal.namedAction', {
              blockName,
              action: t('terminal.action.restartEmpty')
            })}
            onClick={onRestart}
          >
            <GroupRestartIcon size={16} />
          </button>
        </TooltipLabel>
        <span className="terminal-node__action-divider" aria-hidden="true" />
        <TooltipLabel content={t('terminal.action.edit')}>
          <button
            className="terminal-node__action"
            type="button"
            aria-label={t('terminal.namedAction', {
              blockName,
              action: t('terminal.action.edit')
            })}
            onClick={onStartEditing}
          >
            <Edit3 size={15} aria-hidden="true" />
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
            <X size={15} aria-hidden="true" />
          </button>
        </TooltipLabel>
      </div>
    </div>
  )
}
