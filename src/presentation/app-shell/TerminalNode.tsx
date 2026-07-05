import {
  Handle,
  NodeResizer,
  Position,
  type NodeProps,
  type ResizeDragEvent,
  type ResizeParams
} from '@xyflow/react'
import { memo, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

import { TerminalNodeIcon } from './TerminalNodeIcons'
import { TerminalViewport } from './TerminalViewport'
import {
  terminalNodeMinimumSize,
  type TerminalBlockSizeInput,
  type TerminalDimensions,
  type TerminalFlowNode,
  type TerminalViewState
} from './types'

export const TerminalNode = memo(function TerminalNode({ data }: NodeProps<TerminalFlowNode>) {
  const block = data.block
  const session = data.session
  const isRunning = session.status === 'running'
  const [isEditingMetadata, setIsEditingMetadata] = useState(false)
  const [draftName, setDraftName] = useState(block.name)
  const [draftDescription, setDraftDescription] = useState(block.description)
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
    setIsEditingMetadata(true)
  }, [block.description, block.name])

  const resizeTerminalBlock = useCallback(
    (_event: ResizeDragEvent, size: ResizeParams) => {
      void data.onResizeBlock(block, toTerminalBlockSizeInput(size))
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
        description: draftDescription.trim()
      })
      setIsEditingMetadata(false)
    },
    [block, data, draftDescription, trimmedDraftName]
  )

  return (
    <section className={terminalNodeClassName} data-terminal-block-id={block.id}>
      <NodeResizer
        isVisible={data.isSelected}
        minWidth={terminalNodeMinimumSize.width}
        minHeight={terminalNodeMinimumSize.height}
        color="#94a3b8"
        handleClassName="terminal-node__resize-handle nodrag"
        lineClassName="terminal-node__resize-line"
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
        terminalStateClassName={terminalStateClassName}
        isRunning={isRunning}
        sessionStatus={session.status}
        onStartEditing={startEditingMetadata}
        onStop={() => data.onStop(block)}
        onRestart={() => data.onRestart(block)}
        onDelete={() => data.onDelete(block)}
      />
      {isEditingMetadata ? (
        <TerminalMetadataForm
          draftName={draftName}
          draftDescription={draftDescription}
          trimmedDraftName={trimmedDraftName}
          onDraftNameChange={setDraftName}
          onDraftDescriptionChange={setDraftDescription}
          onSave={saveMetadata}
          onCancel={() => {
            setDraftName(block.name)
            setDraftDescription(block.description)
            setIsEditingMetadata(false)
          }}
        />
      ) : null}
      <div className="terminal-frame">
        <TerminalViewport
          block={block}
          session={session}
          onDimensionsChange={handleDimensionsChange}
          onInput={data.onInput}
        />
      </div>
      <Handle
        className="terminal-node__handle terminal-node__handle--output"
        type="source"
        position={Position.Right}
      />
    </section>
  )
})

function toTerminalBlockSizeInput(size: ResizeParams): TerminalBlockSizeInput {
  return {
    width: Math.round(size.width),
    height: Math.round(size.height)
  }
}

interface TerminalHeaderProps {
  readonly blockName: string
  readonly blockDescription: string
  readonly terminalStateClassName: string
  readonly isRunning: boolean
  readonly sessionStatus: TerminalViewState['status']
  readonly onStartEditing: () => void
  readonly onStop: () => void
  readonly onRestart: () => void
  readonly onDelete: () => void
}

function TerminalHeader({
  blockName,
  blockDescription,
  terminalStateClassName,
  isRunning,
  sessionStatus,
  onStartEditing,
  onStop,
  onRestart,
  onDelete
}: TerminalHeaderProps) {
  return (
    <div className="terminal-node__header">
      <span className="terminal-node__icon">
        <TerminalNodeIcon name="terminal" size={23} />
      </span>
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
      >
        <button
          className="terminal-node__action"
          type="button"
          aria-label={`${blockName} 编辑终端信息`}
          title="编辑终端信息"
          onClick={onStartEditing}
        >
          <TerminalNodeIcon name="edit" />
        </button>
        <button
          className="terminal-node__action"
          type="button"
          aria-label={`${blockName} 停止当前命令`}
          title="停止当前命令 (Ctrl+C)"
          disabled={!isRunning}
          onClick={onStop}
        >
          <TerminalNodeIcon name="stop" />
        </button>
        <button
          className="terminal-node__action"
          type="button"
          aria-label={`${blockName} 重启终端`}
          title="重启终端"
          onClick={onRestart}
        >
          <TerminalNodeIcon name="restart" />
        </button>
        <button
          className="terminal-node__action terminal-node__action--danger"
          type="button"
          aria-label={`${blockName} 删除终端`}
          title="删除终端"
          onClick={onDelete}
        >
          <TerminalNodeIcon name="delete" />
        </button>
      </div>
    </div>
  )
}

interface TerminalMetadataFormProps {
  readonly draftName: string
  readonly draftDescription: string
  readonly trimmedDraftName: string
  readonly onDraftNameChange: (value: string) => void
  readonly onDraftDescriptionChange: (value: string) => void
  readonly onSave: (event: FormEvent<HTMLFormElement>) => void
  readonly onCancel: () => void
}

function TerminalMetadataForm({
  draftName,
  draftDescription,
  trimmedDraftName,
  onDraftNameChange,
  onDraftDescriptionChange,
  onSave,
  onCancel
}: TerminalMetadataFormProps) {
  return (
    <form
      className="terminal-metadata-form nodrag"
      onSubmit={onSave}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <input
        aria-label="终端名称"
        value={draftName}
        onChange={(event) => onDraftNameChange(event.currentTarget.value)}
      />
      <input
        aria-label="终端描述"
        value={draftDescription}
        onChange={(event) => onDraftDescriptionChange(event.currentTarget.value)}
      />
      <div className="terminal-metadata-form__actions">
        <button
          className="terminal-node__action terminal-node__action--confirm"
          type="submit"
          aria-label="保存终端信息"
          title="保存终端信息"
          disabled={!trimmedDraftName}
        >
          <TerminalNodeIcon name="check" />
        </button>
        <button
          className="terminal-node__action"
          type="button"
          aria-label="取消编辑终端信息"
          title="取消编辑终端信息"
          onClick={onCancel}
        >
          <TerminalNodeIcon name="close" />
        </button>
      </div>
    </form>
  )
}
