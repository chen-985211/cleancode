import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode
} from 'react'

import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import { trapFocus } from './modalFocus'
import { TooltipLabel } from './Tooltip'
import { useI18n } from './i18n/useI18n'

export function AgentConsoleActions({
  agent,
  capabilityControl,
  onRemove,
  onRename,
  onSelect
}: {
  readonly agent: WorkspaceAgentSnapshot
  readonly capabilityControl?: ReactNode
  readonly onRemove: (agent: WorkspaceAgentSnapshot) => Promise<void>
  readonly onRename: (agent: WorkspaceAgentSnapshot, name: string) => Promise<void>
  readonly onSelect?: () => void
}) {
  const { t } = useI18n()
  const [mode, setMode] = useState<'closed' | 'menu' | 'remove' | 'rename'>('closed')
  const [name, setName] = useState(agent.name)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const actionsRef = useRef<HTMLDivElement | null>(null)
  const cancelRemoveRef = useRef<HTMLButtonElement | null>(null)
  const confirmRemoveRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (mode !== 'menu') return undefined

    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()

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

  useEffect(() => {
    if (mode === 'remove') cancelRemoveRef.current?.focus()
  }, [mode])

  useEffect(() => {
    if (mode === 'remove' && isSubmitting) confirmRemoveRef.current?.focus()
  }, [isSubmitting, mode])

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
  const cancelRemove = (): void => {
    if (isSubmitting) return
    setMode('closed')
    menuTriggerRef.current?.focus()
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
            aria-label={t('agent.name')}
            autoFocus
            value={name}
            onBlur={cancelRename}
            onChange={(event) => setName(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={handleEditorKeyDown}
          />
        </form>
      ) : (
        <TooltipLabel content={t('agent.renameTitle')}>
          <button
            className="agent-console-actions__title"
            type="button"
            aria-label={t('agent.renameHint', { agentName: agent.name })}
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
        </TooltipLabel>
      )}
      {capabilityControl}
      {mode !== 'rename' ? (
        <span className="agent-console-actions__menu-anchor">
          <TooltipLabel content={t('sidebar.more')}>
            <button
              className="agent-console-actions__more nodrag"
              ref={menuTriggerRef}
              type="button"
              aria-label={t('agent.moreActions', { agentName: agent.name })}
              aria-expanded={mode === 'menu'}
              aria-haspopup="menu"
              disabled={isSubmitting}
              onClick={(event) => {
                event.stopPropagation()
                setMode((current) => (current === 'menu' ? 'closed' : 'menu'))
              }}
            >
              <MoreHorizontal size={15} aria-hidden="true" />
            </button>
          </TooltipLabel>
          {mode === 'menu' ? (
            <div
              className="agent-console-actions__menu nodrag"
              role="menu"
              aria-label={t('agent.actions', { agentName: agent.name })}
              onKeyDown={(event) => moveMenuFocus(event, menuRef.current)}
              ref={menuRef}
            >
              <button type="button" role="menuitem" onClick={startRename}>
                <Pencil size={14} aria-hidden="true" />
                {t('agent.rename')}
              </button>
              <button
                className="agent-console-actions__menu-item--danger"
                type="button"
                role="menuitem"
                onClick={() => setMode('remove')}
              >
                <Trash2 size={14} aria-hidden="true" />
                {t('agent.remove')}
              </button>
            </div>
          ) : null}
        </span>
      ) : null}
      {mode === 'remove' ? (
        <div
          aria-busy={isSubmitting}
          className="agent-console-actions__confirm nodrag"
          ref={confirmRemoveRef}
          role="dialog"
          tabIndex={-1}
          aria-label={t('agent.remove')}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !isSubmitting) {
              event.stopPropagation()
              cancelRemove()
              return
            }
            trapFocus(event, event.currentTarget)
          }}
        >
          <span>{t('agent.removeDescription')}</span>
          <button
            ref={cancelRemoveRef}
            type="button"
            disabled={isSubmitting}
            onClick={cancelRemove}
          >
            {t('common.cancel')}
          </button>
          <button type="button" onClick={() => void removeAgent()} disabled={isSubmitting}>
            {t('common.remove')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function moveMenuFocus(event: ReactKeyboardEvent<HTMLElement>, menu: HTMLElement | null): void {
  if (!menu || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
  if (items.length === 0) return
  event.preventDefault()
  const currentIndex = items.findIndex((item) => item === document.activeElement)
  if (event.key === 'Home') {
    items[0]?.focus()
    return
  }
  if (event.key === 'End') {
    items.at(-1)?.focus()
    return
  }
  const direction = event.key === 'ArrowDown' ? 1 : -1
  const nextIndex = (Math.max(currentIndex, 0) + direction + items.length) % items.length
  items[nextIndex]?.focus()
}
