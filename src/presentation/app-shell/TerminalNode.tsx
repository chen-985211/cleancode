import {
  Handle,
  Position,
  type NodeProps,
  type ResizeDragEvent,
  type ResizeParams
} from '@xyflow/react'
import { Check, Edit3, Play, Square, Terminal, Waypoints, X } from 'lucide-react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'

import { GroupRestartIcon } from './TerminalGroupIcons'
import { TerminalMetadataForm } from './TerminalMetadataForm'
import type { TerminalExecutionConfigSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { agentApprovalTargetHandleId } from './agentApprovalHandles'
import { TerminalViewport } from './TerminalViewport'
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
      await data.onUpdateMetadata(block, metadata)
      await data.onUpdateExecutionConfig?.(block, executionConfig)
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
        onSelect={(additive) => data.onSelect?.(additive)}
        onToggleTerminalGroupCandidate={() => data.onToggleTerminalGroupCandidate(block)}
        onStartEditing={startEditingMetadata}
        onStop={stopTerminal}
        onQuickLaunch={quickLaunchTerminal}
        onRestart={restartTerminal}
        onRunFromHere={() => data.onRunFromHere?.(block)}
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
      <div className="terminal-frame">
        <TerminalViewport
          key={session.sessionId ?? 'idle'}
          block={block}
          session={session}
          focusRequestId={focusRequestId}
          isResizeSuspended={isResizingBlock}
          onDimensionsChange={handleDimensionsChange}
          onInput={data.onInput}
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
  readonly onSelect: (additive: boolean) => void
  readonly onToggleTerminalGroupCandidate: () => void
  readonly onStartEditing: () => void
  readonly onStop: () => void
  readonly onQuickLaunch: () => void
  readonly onRestart: () => void
  readonly onRunFromHere: () => void
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
  onSelect,
  onToggleTerminalGroupCandidate,
  onStartEditing,
  onStop,
  onQuickLaunch,
  onRestart,
  onRunFromHere,
  onDelete
}: TerminalHeaderProps) {
  const canQuickLaunch = blockLaunchCommand.trim().length > 0
  const launchCommandState = canQuickLaunch ? 'configured' : 'unconfigured'
  const launchCommandTooltip = canQuickLaunch ? '启动命令' : '配置启动命令'
  const terminalGroupSelectionLabel = isSelectedForTerminalGroup ? '已选择终端' : '选择终端'
  return (
    <div className="terminal-node__header" onClick={(event) => onSelect(event.shiftKey)}>
      <span className="terminal-node__icon">
        <Terminal size={19} aria-hidden="true" />
      </span>
      {isTerminalGroupSelectionMode ? (
        <button
          className={[
            'terminal-node__group-select nodrag',
            isSelectedForTerminalGroup ? 'terminal-node__group-select--selected' : ''
          ]
            .filter(Boolean)
            .join(' ')}
          type="button"
          aria-pressed={isSelectedForTerminalGroup}
          aria-label={`${blockName} ${terminalGroupSelectionLabel}`}
          title={terminalGroupSelectionLabel}
          data-cc-tooltip={terminalGroupSelectionLabel}
          disabled={!canSelectForTerminalGroup}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onToggleTerminalGroupCandidate()
          }}
        >
          {isSelectedForTerminalGroup ? <Check size={16} aria-hidden="true" /> : null}
        </button>
      ) : null}
      <div className="terminal-node__title">
        <strong>{blockName}</strong>
        <div className="terminal-node__meta">
          <span className="terminal-node__description">{blockDescription}</span>
          <span className={terminalStateClassName}>
            {isRunning
              ? '运行中'
              : sessionStatus === 'failed'
                ? '失败'
                : sessionStatus === 'exited'
                  ? '已退出'
                  : '未启动'}
          </span>
          {workflowStatus ? (
            <span className={`workflow-state workflow-state--${workflowStatus}`}>
              {workflowStatusLabels[workflowStatus]}
            </span>
          ) : null}
        </div>
      </div>
      <div
        className="terminal-node__actions nodrag"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="terminal-node__action terminal-node__action--workflow"
          type="button"
          aria-label={`${blockName} 从此处运行终端流程`}
          title="从此终端开始运行依赖流程"
          data-cc-tooltip="从此处运行流程"
          disabled={!canQuickLaunch}
          onClick={onRunFromHere}
        >
          <Waypoints size={15} aria-hidden="true" />
        </button>
        <button
          className={[
            'terminal-node__action',
            'terminal-node__action--launch',
            `terminal-node__action--launch-${launchCommandState}`
          ].join(' ')}
          type="button"
          aria-label={`${blockName} 启动命令`}
          title={launchCommandTooltip}
          data-cc-tooltip={launchCommandTooltip}
          data-launch-command-state={launchCommandState}
          onClick={onQuickLaunch}
        >
          <Play size={15} aria-hidden="true" />
        </button>
        <button
          className="terminal-node__action"
          type="button"
          aria-label={`${blockName} 停止当前命令`}
          title="停止当前命令 (Ctrl+C)"
          data-cc-tooltip="停止当前命令"
          disabled={!isRunning}
          onClick={onStop}
        >
          <Square size={14} aria-hidden="true" />
        </button>
        <button
          className="terminal-node__action"
          type="button"
          aria-label={`${blockName} 重开空终端会话`}
          title="重开空终端会话，不执行启动命令"
          data-cc-tooltip="重开空终端会话，不执行启动命令"
          onClick={onRestart}
        >
          <GroupRestartIcon size={16} />
        </button>
        <span className="terminal-node__action-divider" aria-hidden="true" />
        <button
          className="terminal-node__action"
          type="button"
          aria-label={`${blockName} 编辑终端信息`}
          title="编辑终端信息"
          data-cc-tooltip="编辑终端信息"
          onClick={onStartEditing}
        >
          <Edit3 size={15} aria-hidden="true" />
        </button>
        <button
          className="terminal-node__action terminal-node__action--danger"
          type="button"
          aria-label={`${blockName} 删除终端`}
          title="删除终端"
          data-cc-tooltip="删除终端"
          onClick={onDelete}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

const workflowStatusLabels = {
  waiting: '等待',
  running: '执行中',
  ready: '已就绪',
  succeeded: '成功',
  failed: '失败',
  blocked: '已阻断',
  stopped: '已停止'
} as const
