import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'

import type { WorkspaceAgentSnapshot } from '../../../../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import { CanvasNodeMenu } from '../../menus/CanvasNodeMenu'
import { CanvasMenuItem } from '../../../../shared/components/CanvasMenuItem'
import { TooltipLabel } from '../../../../shared/components/Tooltip'
import { useI18n } from '../../../../i18n/useI18n'
import { WorkbenchIcon } from '../../../../shared/components/WorkbenchIcons'

interface MenuPosition {
  readonly anchorX: number
  readonly anchorY: number
  readonly left: number
  readonly side: 'bottom' | 'top'
  readonly top: number
}

export function AgentConsoleActions({
  agent,
  capabilityControl,
  identityControl,
  onRemove,
  onRename,
  onSelect,
  statusControl
}: {
  readonly agent: WorkspaceAgentSnapshot
  readonly capabilityControl?: ReactNode
  readonly identityControl?: ReactNode
  readonly onRemove: (agent: WorkspaceAgentSnapshot) => Promise<void>
  readonly onRename: (agent: WorkspaceAgentSnapshot, name: string) => Promise<void>
  readonly onSelect?: () => void
  readonly statusControl?: ReactNode
}) {
  const { t } = useI18n()
  const [mode, setMode] = useState<'closed' | 'menu' | 'rename'>('closed')
  const [name, setName] = useState(agent.name)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeMenuItem, setActiveMenuItem] = useState(0)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const [isMenuPresent, setIsMenuPresent] = useState(false)
  const actionsRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const menuId = `agent-actions-menu-${agent.agentId}`

  useEffect(() => {
    if (mode !== 'menu') return undefined

    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()

    const closeOnOutsidePointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (!actionsRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setMode('closed')
      }
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
  }, [isMenuPresent, mode])

  useLayoutEffect(() => {
    if (mode !== 'menu') return undefined

    const positionMenu = (): void => {
      const trigger = menuTriggerRef.current
      const menu = menuRef.current
      if (!trigger || !menu) return

      const triggerRect = trigger.getBoundingClientRect()
      const menuWidth = menu.offsetWidth
      const menuHeight = menu.offsetHeight
      const viewportPadding = 8
      const gap = 6
      const opensAbove =
        triggerRect.bottom + gap + menuHeight > window.innerHeight - viewportPadding &&
        triggerRect.top - gap - menuHeight >= viewportPadding
      const preferredTop = opensAbove
        ? triggerRect.top - gap - menuHeight
        : triggerRect.bottom + gap
      const maximumTop = Math.max(
        viewportPadding,
        window.innerHeight - menuHeight - viewportPadding
      )
      const maximumLeft = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding)

      setMenuPosition({
        anchorX: triggerRect.right,
        anchorY: opensAbove ? triggerRect.top : triggerRect.bottom,
        left: Math.min(Math.max(viewportPadding, triggerRect.right - menuWidth), maximumLeft),
        side: opensAbove ? 'top' : 'bottom',
        top: Math.min(Math.max(viewportPadding, preferredTop), maximumTop)
      })
    }

    positionMenu()
    window.addEventListener('resize', positionMenu)
    window.addEventListener('scroll', positionMenu, true)
    return () => {
      window.removeEventListener('resize', positionMenu)
      window.removeEventListener('scroll', positionMenu, true)
    }
  }, [isMenuPresent, mode])

  const commitRename = async (): Promise<void> => {
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
  const submitRename = (event: FormEvent): void => {
    event.preventDefault()
    void commitRename()
  }
  const removeAgent = async (): Promise<void> => {
    if (isSubmitting) return
    setMode('closed')
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
      <div className="agent-console-actions__start">
        {identityControl}
        {mode === 'rename' ? (
          <form className="agent-console-actions__editor nodrag" onSubmit={submitRename}>
            <input
              aria-label={t('agent.name')}
              autoFocus
              value={name}
              onBlur={() => {
                if (name.trim()) {
                  void commitRename()
                } else {
                  cancelRename()
                }
              }}
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
      </div>
      <div className="agent-console-actions__center">{capabilityControl}</div>
      <div className="agent-console-actions__end">
        {mode !== 'rename' ? statusControl : null}
        {mode !== 'rename' ? (
          <span className="agent-console-actions__menu-anchor">
            <TooltipLabel content={t('sidebar.more')}>
              <button
                className="agent-console-actions__more nodrag"
                ref={menuTriggerRef}
                type="button"
                aria-controls={mode === 'menu' ? menuId : undefined}
                aria-label={t('agent.moreActions', { agentName: agent.name })}
                aria-expanded={mode === 'menu'}
                aria-haspopup="menu"
                disabled={isSubmitting}
                onClick={(event) => {
                  event.stopPropagation()
                  setMenuPosition(null)
                  setActiveMenuItem(0)
                  setMode((current) => (current === 'menu' ? 'closed' : 'menu'))
                }}
              >
                <WorkbenchIcon role="more" size={15} />
              </button>
            </TooltipLabel>
          </span>
        ) : null}
      </div>
      {createPortal(
        <CanvasNodeMenu
          anchor={{
            x: menuPosition?.anchorX ?? 0,
            y: menuPosition?.anchorY ?? 0
          }}
          id={menuId}
          menuId={menuId}
          motionReady={menuPosition !== null}
          open={mode === 'menu'}
          role="menu"
          aria-label={t('agent.actions', { agentName: agent.name })}
          data-side={menuPosition?.side ?? 'bottom'}
          onRequestClose={() => setMode('closed')}
          onPresenceChange={setIsMenuPresent}
          onBlur={(event) => {
            if (
              mode === 'menu' &&
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            ) {
              setMode('closed')
            }
          }}
          onKeyDown={(event) => moveMenuFocus(event, menuRef.current)}
          ref={menuRef}
          style={{
            left: menuPosition?.left ?? 0,
            top: menuPosition?.top ?? 0,
            visibility: menuPosition ? 'visible' : 'hidden'
          }}
        >
          <CanvasMenuItem
            type="button"
            role="menuitem"
            tabIndex={activeMenuItem === 0 ? 0 : -1}
            onClick={startRename}
            onFocus={() => setActiveMenuItem(0)}
          >
            <WorkbenchIcon role="edit" size={14} />
            {t('agent.rename')}
          </CanvasMenuItem>
          <CanvasMenuItem
            type="button"
            role="menuitem"
            tabIndex={activeMenuItem === 1 ? 0 : -1}
            onClick={() => void removeAgent()}
            onFocus={() => setActiveMenuItem(1)}
          >
            <WorkbenchIcon role="delete" size={14} />
            {t('agent.remove')}
          </CanvasMenuItem>
        </CanvasNodeMenu>,
        document.body
      )}
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
