import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'
import { createPortal } from 'react-dom'

import type { WorkspaceAgentSnapshot } from '../../../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import { AgentCanvasContextActions } from '../../../../contexts/agent/presentation/components/AgentCanvasContextActions'
import { TerminalCanvasContextActions } from '../../../../contexts/block-graph/presentation/components/TerminalCanvasContextActions'
import type {
  CanvasObjectContextTarget,
  CanvasTerminalObjectContextTarget
} from './canvasObjectContextTarget'
import { restoreCanvasMenuFocus } from './canvasMenuFocus'
import { CanvasNodeMenu } from './CanvasNodeMenu'
import { resolveCanvasObjectContextMenuPosition } from './canvasObjectContextMenuPosition'
import { useI18n } from '../../../i18n/useI18n'

interface CanvasObjectContextMenuProps {
  readonly agentActions?: {
    readonly agent: WorkspaceAgentSnapshot
    readonly onRemove: (agent: WorkspaceAgentSnapshot) => Promise<void>
    readonly onRename: (agent: WorkspaceAgentSnapshot, name: string) => Promise<void>
  }
  readonly open: boolean
  readonly position: { readonly x: number; readonly y: number }
  readonly requestId: number
  readonly target: CanvasObjectContextTarget
  readonly onClose: () => void
  readonly onFavorite?: (terminalBlockIds: readonly string[]) => void
  readonly onAddToQuickExecution?: (target: CanvasTerminalObjectContextTarget) => void
  readonly onRemove?: (target: CanvasObjectContextTarget) => void
}

export function CanvasObjectContextMenu({
  agentActions,
  open,
  position,
  requestId,
  target,
  onClose,
  onFavorite,
  onAddToQuickExecution,
  onRemove
}: CanvasObjectContextMenuProps) {
  const { t } = useI18n()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)
  const [isMenuPresent, setIsMenuPresent] = useState(open)
  const [mode, setMode] = useState<'actions' | 'rename'>('actions')
  const resetKey = `${requestId}\0${agentActions?.agent.name ?? ''}`
  const [previousResetKey, setPreviousResetKey] = useState(resetKey)
  const [resolvedPosition, setResolvedPosition] = useState<{
    readonly left: number
    readonly mode: 'actions' | 'rename'
    readonly pointerX: number
    readonly pointerY: number
    readonly requestId: number
    readonly top: number
  } | null>(null)

  if (resetKey !== previousResetKey) {
    setPreviousResetKey(resetKey)
    setMode('actions')
  }

  useEffect(() => {
    if (!open) return undefined
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()

    const closeOnOutsidePointerDown = (event: PointerEvent): void => {
      const eventTarget = event.target
      if (eventTarget instanceof Node && menuRef.current?.contains(eventTarget)) return
      onClose()
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      onClose()
      restoreCanvasMenuFocus(returnFocusRef.current)
    }

    document.addEventListener('pointerdown', closeOnOutsidePointerDown)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isMenuPresent, mode, onClose, open])

  useLayoutEffect(() => {
    if (open && !wasOpenRef.current) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
    }
    wasOpenRef.current = open
  }, [open])

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return undefined

    const updatePosition = (): void => {
      setResolvedPosition({
        ...resolveCanvasObjectContextMenuPosition({
          menuHeight: menu.offsetHeight,
          menuWidth: menu.offsetWidth,
          pointerX: position.x,
          pointerY: position.y,
          viewportHeight: window.innerHeight,
          viewportWidth: window.innerWidth
        }),
        mode,
        pointerX: position.x,
        pointerY: position.y,
        requestId
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    return () => window.removeEventListener('resize', updatePosition)
  }, [isMenuPresent, mode, position.x, position.y, requestId])

  const ariaLabel =
    target.kind === 'agent' && agentActions
      ? t('agent.actions', { agentName: agentActions.agent.name })
      : target.kind === 'agent'
        ? t('agent.actions', { agentName: target.agentId })
        : t(`canvas.contextMenu.${target.kind}Actions`)
  const motionReady =
    resolvedPosition?.mode === mode &&
    resolvedPosition.pointerX === position.x &&
    resolvedPosition.pointerY === position.y &&
    resolvedPosition.requestId === requestId

  return createPortal(
    <CanvasNodeMenu
      ref={menuRef}
      anchor={position}
      menuId="canvas-object-context-menu"
      motionReady={motionReady}
      open={open}
      role={mode === 'rename' ? 'dialog' : 'menu'}
      aria-label={mode === 'rename' ? t('agent.rename') : ariaLabel}
      onRequestClose={onClose}
      onPresenceChange={setIsMenuPresent}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onClose()
      }}
      onKeyDown={(event) => {
        if (mode === 'actions') keepMenuItemFocused(event, menuRef.current)
      }}
      style={{
        left: motionReady ? (resolvedPosition?.left ?? 0) : 0,
        top: motionReady ? (resolvedPosition?.top ?? 0) : 0,
        visibility: motionReady ? 'visible' : 'hidden'
      }}
    >
      {target.kind === 'agent' && agentActions ? (
        <AgentCanvasContextActions
          key={resetKey}
          agent={agentActions.agent}
          mode={mode}
          onClose={onClose}
          onModeChange={setMode}
          onRemove={agentActions.onRemove}
          onRename={agentActions.onRename}
        />
      ) : target.kind === 'agent' ? null : (
        <TerminalCanvasContextActions
          target={target}
          onAddToQuickExecution={onAddToQuickExecution}
          onClose={onClose}
          onFavorite={onFavorite}
          onRemove={onRemove}
        />
      )}
    </CanvasNodeMenu>,
    document.body
  )
}

function keepMenuItemFocused(
  event: ReactKeyboardEvent<HTMLElement>,
  menu: HTMLElement | null
): void {
  if (!menu || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
  const activeIndex = items.findIndex((item) => item === document.activeElement)
  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : event.key === 'ArrowDown'
          ? (activeIndex + 1) % items.length
          : (activeIndex - 1 + items.length) % items.length
  items[nextIndex]?.focus()
}
