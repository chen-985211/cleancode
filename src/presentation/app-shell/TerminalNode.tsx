import {
  Handle,
  Position,
  type NodeProps,
  type ResizeDragEvent,
  type ResizeParams
} from '@xyflow/react'
import { Check, Edit3, MoreHorizontal, Play, Square, Terminal, Trash2, X } from 'lucide-react'
import { memo, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

import { TerminalViewport } from './TerminalViewport'
import { WorkbenchNodeResizer } from './WorkbenchNodeResizer'
import { WorkbenchNodeSelectionVeil } from './WorkbenchNodeSelectionVeil'
import {
  terminalNodeMinimumSize,
  type TerminalDimensions,
  type TerminalFlowNode,
  type TerminalViewState,
  type WorkbenchNodeLayoutInput
} from './types'

export const TerminalNode = memo(function TerminalNode({ data }: NodeProps<TerminalFlowNode>) {
  const block = data.block
  const session = data.session
  const isRunning = session.status === 'running'
  const [isEditingMetadata, setIsEditingMetadata] = useState(false)
  const [draftName, setDraftName] = useState(block.name)
  const [draftDescription, setDraftDescription] = useState(block.description)
  const [draftLaunchCommand, setDraftLaunchCommand] = useState(block.launchCommand)
  const [shouldFocusLaunchCommand, setShouldFocusLaunchCommand] = useState(false)
  const [focusRequestId, setFocusRequestId] = useState(0)
  const [isResizingBlock, setIsResizingBlock] = useState(false)
  const hasRequestedAutoStartRef = useRef(false)
  const lastDimensionsRef = useRef<TerminalDimensions | null>(null)
  const trimmedDraftName = draftName.trim()
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
    data.isNavigationHighlighted ? 'terminal-node--navigation-highlighted' : ''
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
    setDraftName(block.name)
    setDraftDescription(block.description)
    setDraftLaunchCommand(block.launchCommand)
    setShouldFocusLaunchCommand(false)
    setIsEditingMetadata(true)
  }, [block.description, block.launchCommand, block.name])

  const startEditingLaunchCommand = useCallback(() => {
    setDraftName(block.name)
    setDraftDescription(block.description)
    setDraftLaunchCommand(block.launchCommand)
    setShouldFocusLaunchCommand(true)
    setIsEditingMetadata(true)
  }, [block.description, block.launchCommand, block.name])

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
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      if (!trimmedDraftName) {
        return
      }

      await data.onUpdateMetadata(block, {
        name: trimmedDraftName,
        description: draftDescription.trim(),
        launchCommand: draftLaunchCommand.trim()
      })
      setShouldFocusLaunchCommand(false)
      setIsEditingMetadata(false)
    },
    [block, data, draftDescription, draftLaunchCommand, trimmedDraftName]
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
        onSelect={(additive) => data.onSelect?.(additive)}
        onToggleTerminalGroupCandidate={() => data.onToggleTerminalGroupCandidate(block)}
        onStartEditing={startEditingMetadata}
        onStop={stopTerminal}
        onQuickLaunch={quickLaunchTerminal}
        onRestart={restartTerminal}
        onDelete={() => data.onDelete(block)}
      />
      {isEditingMetadata ? (
        <TerminalMetadataForm
          draftName={draftName}
          draftDescription={draftDescription}
          draftLaunchCommand={draftLaunchCommand}
          shouldFocusLaunchCommand={shouldFocusLaunchCommand}
          trimmedDraftName={trimmedDraftName}
          onDraftNameChange={setDraftName}
          onDraftDescriptionChange={setDraftDescription}
          onDraftLaunchCommandChange={setDraftLaunchCommand}
          onSave={saveMetadata}
          onCancel={() => {
            setDraftName(block.name)
            setDraftDescription(block.description)
            setDraftLaunchCommand(block.launchCommand)
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
  readonly onSelect: (additive: boolean) => void
  readonly onToggleTerminalGroupCandidate: () => void
  readonly onStartEditing: () => void
  readonly onStop: () => void
  readonly onQuickLaunch: () => void
  readonly onRestart: () => void
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
  onSelect,
  onToggleTerminalGroupCandidate,
  onStartEditing,
  onStop,
  onQuickLaunch,
  onRestart,
  onDelete
}: TerminalHeaderProps) {
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)
  const canQuickLaunch = blockLaunchCommand.trim().length > 0
  const launchCommandState = canQuickLaunch ? 'configured' : 'unconfigured'
  const launchCommandTooltip = canQuickLaunch ? '启动命令' : '配置启动命令'
  const terminalGroupSelectionLabel = isSelectedForTerminalGroup ? '已选择终端' : '选择终端'
  const restartEmptySession = useCallback(() => {
    setIsMoreMenuOpen(false)
    onRestart()
  }, [onRestart])

  return (
    <div className="terminal-node__header" onClick={(event) => onSelect(event.shiftKey)}>
      <span className="terminal-node__icon">
        <Terminal size={23} aria-hidden="true" />
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
        <span>{blockDescription}</span>
      </div>
      <span className={terminalStateClassName}>
        {isRunning
          ? '运行中'
          : sessionStatus === 'failed'
            ? '失败'
            : sessionStatus === 'exited'
              ? '已退出'
              : '未启动'}
      </span>
      <div
        className="terminal-node__actions nodrag"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
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
        <span className="terminal-node__more-action">
          <button
            className="terminal-node__action"
            type="button"
            aria-label={`${blockName} 更多终端操作`}
            aria-expanded={isMoreMenuOpen}
            aria-haspopup="true"
            title="更多终端操作"
            data-cc-tooltip="更多终端操作"
            onClick={() => setIsMoreMenuOpen((isOpen) => !isOpen)}
          >
            <MoreHorizontal size={15} aria-hidden="true" />
          </button>
          {isMoreMenuOpen ? (
            <div className="terminal-node__action-menu">
              <button
                className="terminal-node__menu-action"
                type="button"
                aria-label={`${blockName} 重开空终端会话`}
                title="重开空终端会话，不执行启动命令"
                data-cc-tooltip="重开空终端会话，不执行启动命令"
                onClick={restartEmptySession}
              >
                <Terminal size={14} aria-hidden="true" />
                <span>重开空终端会话</span>
              </button>
            </div>
          ) : null}
        </span>
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
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

interface TerminalMetadataFormProps {
  readonly draftName: string
  readonly draftDescription: string
  readonly draftLaunchCommand: string
  readonly shouldFocusLaunchCommand: boolean
  readonly trimmedDraftName: string
  readonly onDraftNameChange: (value: string) => void
  readonly onDraftDescriptionChange: (value: string) => void
  readonly onDraftLaunchCommandChange: (value: string) => void
  readonly onSave: (event: FormEvent<HTMLFormElement>) => void
  readonly onCancel: () => void
}

function TerminalMetadataForm({
  draftName,
  draftDescription,
  draftLaunchCommand,
  shouldFocusLaunchCommand,
  trimmedDraftName,
  onDraftNameChange,
  onDraftDescriptionChange,
  onDraftLaunchCommandChange,
  onSave,
  onCancel
}: TerminalMetadataFormProps) {
  const launchCommandInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (shouldFocusLaunchCommand) {
      launchCommandInputRef.current?.focus()
    }
  }, [shouldFocusLaunchCommand])

  return (
    <form
      className="terminal-metadata-form nodrag"
      aria-label="编辑终端信息"
      onSubmit={onSave}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="terminal-metadata-form__fields">
        <label className="terminal-metadata-field">
          <span>名称</span>
          <input
            aria-label="终端名称"
            placeholder="例如：Web Server"
            value={draftName}
            onChange={(event) => onDraftNameChange(event.currentTarget.value)}
          />
        </label>
        <label className="terminal-metadata-field">
          <span>描述</span>
          <input
            aria-label="终端描述"
            placeholder="例如：本地开发服务"
            value={draftDescription}
            onChange={(event) => onDraftDescriptionChange(event.currentTarget.value)}
          />
        </label>
        <label className="terminal-metadata-field">
          <span>启动命令</span>
          <input
            aria-label="启动命令"
            ref={launchCommandInputRef}
            placeholder="例如：pnpm dev"
            value={draftLaunchCommand}
            onChange={(event) => onDraftLaunchCommandChange(event.currentTarget.value)}
          />
        </label>
      </div>
      <div className="terminal-metadata-form__footer">
        <button
          className="terminal-node__action terminal-node__action--confirm"
          type="submit"
          aria-label="保存终端信息"
          title="保存终端信息"
          data-cc-tooltip="保存终端信息"
          disabled={!trimmedDraftName}
        >
          <Check size={15} aria-hidden="true" />
        </button>
        <button
          className="terminal-node__action"
          type="button"
          aria-label="取消编辑终端信息"
          title="取消编辑终端信息"
          data-cc-tooltip="取消编辑"
          onClick={onCancel}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    </form>
  )
}
