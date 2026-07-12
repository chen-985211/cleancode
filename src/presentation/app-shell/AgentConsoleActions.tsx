import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'

import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'

export function AgentConsoleActions({
  agent,
  onRemove,
  onRename,
  onSelect
}: {
  readonly agent: WorkspaceAgentSnapshot
  readonly onRemove: (agent: WorkspaceAgentSnapshot) => Promise<void>
  readonly onRename: (agent: WorkspaceAgentSnapshot, name: string) => Promise<void>
  readonly onSelect?: () => void
}) {
  const [mode, setMode] = useState<'closed' | 'menu' | 'remove' | 'rename'>('closed')
  const [name, setName] = useState(agent.name)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const actionsRef = useRef<HTMLDivElement | null>(null)
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (mode !== 'menu') return undefined

    const closeOnOutsidePointerDown = (event: PointerEvent): void => {
      if (!actionsRef.current?.contains(event.target as Node)) setMode('closed')
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setMode('closed')
      menuTriggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', closeOnOutsidePointerDown)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [mode])

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
  const handleEditorKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') cancelRename()
  }

  return (
    <div className="agent-console-actions" ref={actionsRef}>
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
          className="agent-console-actions__title"
          type="button"
          aria-label={`${agent.name}，双击重命名`}
          title="双击重命名"
          onClick={(event) => {
            event.stopPropagation()
            onSelect?.()
          }}
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
      {mode !== 'rename' ? (
        <span className="agent-console-actions__menu-anchor">
          <button
            className="agent-console-actions__more nodrag"
            ref={menuTriggerRef}
            type="button"
            aria-label={`${agent.name} 更多操作`}
            aria-expanded={mode === 'menu'}
            aria-haspopup="menu"
            title="更多操作"
            disabled={isSubmitting}
            onClick={(event) => {
              event.stopPropagation()
              setMode((current) => (current === 'menu' ? 'closed' : 'menu'))
            }}
          >
            <MoreHorizontal size={15} aria-hidden="true" />
          </button>
          {mode === 'menu' ? (
            <div
              className="agent-console-actions__menu nodrag"
              role="menu"
              aria-label={`${agent.name} 操作`}
            >
              <button type="button" role="menuitem" onClick={startRename}>
                <Pencil size={14} aria-hidden="true" />
                重命名 Agent
              </button>
              <button
                className="agent-console-actions__menu-item--danger"
                type="button"
                role="menuitem"
                onClick={() => setMode('remove')}
              >
                <Trash2 size={14} aria-hidden="true" />
                移除 Agent
              </button>
            </div>
          ) : null}
        </span>
      ) : null}
      {mode === 'remove' ? (
        <div
          className="agent-console-actions__confirm nodrag"
          role="dialog"
          aria-label="移除 Agent"
        >
          <span>
            停止并移除此 Agent，取消未完成审批并删除其对话绑定。不会回滚项目文件、删除 Git
            提交或影响其他 Agent。
          </span>
          <button type="button" onClick={() => setMode('closed')}>
            取消
          </button>
          <button type="button" onClick={() => void removeAgent()} disabled={isSubmitting}>
            移除
          </button>
        </div>
      ) : null}
    </div>
  )
}
