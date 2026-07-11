import { X } from 'lucide-react'
import { useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react'

import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'

export function AgentConsoleActions({
  agent,
  onRemove,
  onRename
}: {
  readonly agent: WorkspaceAgentSnapshot
  readonly onRemove: (agent: WorkspaceAgentSnapshot) => Promise<void>
  readonly onRename: (agent: WorkspaceAgentSnapshot, name: string) => Promise<void>
}) {
  const [mode, setMode] = useState<'closed' | 'remove' | 'rename'>('closed')
  const [name, setName] = useState(agent.name)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const stopPropagation = (event: MouseEvent): void => event.stopPropagation()

  const submitRename = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const normalizedName = name.trim()
    if (!normalizedName || isSubmitting) return
    setIsSubmitting(true)
    try {
      await onRename(agent, normalizedName)
      setMode('closed')
    } finally {
      setIsSubmitting(false)
    }
  }
  const removeAgent = async (): Promise<void> => {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await onRemove(agent)
      setMode('closed')
    } finally {
      setIsSubmitting(false)
    }
  }
  const cancelRename = (): void => {
    setName(agent.name)
    setMode('closed')
  }
  const startRename = (): void => {
    setName(agent.name)
    setMode('rename')
  }
  const handleEditorKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') cancelRename()
  }

  return (
    <div className="agent-console-actions" onClick={stopPropagation}>
      {mode === 'rename' ? (
        <form
          className="agent-console-actions__editor nodrag"
          onSubmit={(event) => void submitRename(event)}
        >
          <input
            aria-label="Agent 名称"
            autoFocus
            value={name}
            onBlur={cancelRename}
            onChange={(event) => setName(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={handleEditorKeyDown}
          />
        </form>
      ) : (
        <button
          className="agent-console-actions__title nodrag"
          type="button"
          aria-label={`${agent.name}，双击重命名`}
          title="双击重命名"
          onDoubleClick={(event) => {
            event.stopPropagation()
            startRename()
          }}
          onKeyDown={(event) => {
            if (event.key === 'F2') startRename()
          }}
        >
          {agent.name}
        </button>
      )}
      <button
        className="agent-console-actions__remove nodrag"
        type="button"
        aria-label={`移除 ${agent.name}`}
        title="移除 Agent"
        disabled={isSubmitting}
        onClick={() => setMode('remove')}
      >
        <X size={16} aria-hidden="true" />
      </button>
      {mode === 'remove' ? (
        <div
          className="agent-console-actions__confirm nodrag"
          role="dialog"
          aria-label="移除 Agent"
        >
          <span>停止并移除此 Agent；项目代码不会回滚。</span>
          <button type="button" onClick={() => void removeAgent()} disabled={isSubmitting}>
            移除
          </button>
          <button type="button" onClick={() => setMode('closed')}>
            取消
          </button>
        </div>
      ) : null}
    </div>
  )
}
