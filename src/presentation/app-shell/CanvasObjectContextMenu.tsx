import { Check, Pencil, Rocket, Star, Trash2, X } from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'
import { createPortal } from 'react-dom'

import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type {
  CanvasObjectContextTarget,
  CanvasTerminalObjectContextTarget
} from './canvasObjectContextTarget'
import { CanvasNodeMenu, CanvasNodeMenuItem } from './CanvasNodeMenu'
import { resolveCanvasObjectContextMenuPosition } from './canvasObjectContextMenuPosition'
import { useI18n } from './i18n/useI18n'

interface CanvasObjectContextMenuProps {
  readonly agentActions?: {
    readonly agent: WorkspaceAgentSnapshot
    readonly onRemove: (agent: WorkspaceAgentSnapshot) => Promise<void>
    readonly onRename: (agent: WorkspaceAgentSnapshot, name: string) => Promise<void>
  }
  readonly position: { readonly x: number; readonly y: number }
  readonly target: CanvasObjectContextTarget
  readonly onClose: () => void
  readonly onFavorite?: (terminalBlockIds: readonly string[]) => void
  readonly onAddToQuickExecution?: (target: CanvasTerminalObjectContextTarget) => void
  readonly onRemove?: (target: CanvasObjectContextTarget) => void
}

export function CanvasObjectContextMenu({
  agentActions,
  position,
  target,
  onClose,
  onFavorite,
  onAddToQuickExecution,
  onRemove
}: CanvasObjectContextMenuProps) {
  const { t } = useI18n()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [mode, setMode] = useState<'actions' | 'rename'>('actions')
  const [agentName, setAgentName] = useState(agentActions?.agent.name ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resolvedPosition, setResolvedPosition] = useState<{
    readonly left: number
    readonly top: number
  } | null>(null)

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()

    const closeOnOutsidePointerDown = (event: PointerEvent): void => {
      const eventTarget = event.target
      if (eventTarget instanceof Node && menuRef.current?.contains(eventTarget)) return
      onClose()
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('pointerdown', closeOnOutsidePointerDown)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [mode, onClose])

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return undefined

    const updatePosition = (): void => {
      setResolvedPosition(
        resolveCanvasObjectContextMenuPosition({
          menuHeight: menu.offsetHeight,
          menuWidth: menu.offsetWidth,
          pointerX: position.x,
          pointerY: position.y,
          viewportHeight: window.innerHeight,
          viewportWidth: window.innerWidth
        })
      )
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    return () => window.removeEventListener('resize', updatePosition)
  }, [mode, position.x, position.y])

  const renameAgent = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const normalizedName = agentName.trim()
    if (!agentActions || !normalizedName || isSubmitting) return

    setIsSubmitting(true)
    try {
      await agentActions.onRename(agentActions.agent, normalizedName)
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  const removeAgent = async (): Promise<void> => {
    if (!agentActions || isSubmitting) return

    setIsSubmitting(true)
    onClose()
    try {
      await agentActions.onRemove(agentActions.agent)
    } finally {
      setIsSubmitting(false)
    }
  }

  const ariaLabel =
    target.kind === 'agent' && agentActions
      ? t('agent.actions', { agentName: agentActions.agent.name })
      : target.kind === 'agent'
        ? t('agent.actions', { agentName: target.agentId })
        : t(`canvas.contextMenu.${target.kind}Actions`)

  return createPortal(
    <CanvasNodeMenu
      ref={menuRef}
      role={mode === 'rename' ? 'dialog' : 'menu'}
      aria-label={mode === 'rename' ? t('agent.rename') : ariaLabel}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onClose()
      }}
      onKeyDown={(event) => {
        if (mode === 'actions') keepMenuItemFocused(event, menuRef.current)
      }}
      style={{
        left: resolvedPosition?.left ?? 0,
        top: resolvedPosition?.top ?? 0,
        visibility: resolvedPosition ? 'visible' : 'hidden'
      }}
    >
      {mode === 'rename' && agentActions ? (
        <form
          className="canvas-object-context-menu__rename"
          onSubmit={(event) => void renameAgent(event)}
        >
          <input
            autoFocus
            aria-label={t('agent.name')}
            disabled={isSubmitting}
            value={agentName}
            onChange={(event) => setAgentName(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
          />
          <div className="canvas-object-context-menu__rename-actions">
            <button
              type="submit"
              aria-label={t('agent.saveName')}
              disabled={isSubmitting || !agentName.trim()}
            >
              <Check size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={t('common.cancel')}
              onClick={() => setMode('actions')}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </form>
      ) : target.kind === 'agent' ? (
        <>
          <CanvasNodeMenuItem type="button" role="menuitem" onClick={() => setMode('rename')}>
            <Pencil size={16} aria-hidden="true" />
            {t('agent.rename')}
          </CanvasNodeMenuItem>
          <CanvasNodeMenuItem
            type="button"
            role="menuitem"
            disabled={isSubmitting}
            onClick={() => void removeAgent()}
          >
            <Trash2 size={16} aria-hidden="true" />
            {t('agent.remove')}
          </CanvasNodeMenuItem>
        </>
      ) : (
        <TerminalContextMenuItems
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

function TerminalContextMenuItems({
  target,
  onAddToQuickExecution,
  onClose,
  onFavorite,
  onRemove
}: {
  readonly target: CanvasTerminalObjectContextTarget
  readonly onAddToQuickExecution?: (target: CanvasTerminalObjectContextTarget) => void
  readonly onClose: () => void
  readonly onFavorite?: (terminalBlockIds: readonly string[]) => void
  readonly onRemove?: (target: CanvasObjectContextTarget) => void
}) {
  const { t } = useI18n()

  return (
    <>
      <CanvasNodeMenuItem
        type="button"
        role="menuitem"
        onClick={() => {
          onClose()
          onFavorite?.(target.terminalBlockIds)
        }}
      >
        <Star size={16} aria-hidden="true" />
        {t(`canvas.contextMenu.favorite.${target.kind}`)}
      </CanvasNodeMenuItem>
      {onAddToQuickExecution ? (
        <CanvasNodeMenuItem
          type="button"
          role="menuitem"
          onClick={() => {
            onClose()
            onAddToQuickExecution(target)
          }}
        >
          <Rocket size={16} aria-hidden="true" />
          {t('canvas.contextMenu.addToQuickExecution')}
        </CanvasNodeMenuItem>
      ) : null}
      {target.kind !== 'terminal' && onRemove ? (
        <CanvasNodeMenuItem
          type="button"
          role="menuitem"
          onClick={() => {
            onClose()
            onRemove(target)
          }}
        >
          <Trash2 size={16} aria-hidden="true" />
          {t(`canvas.contextMenu.remove.${target.kind}`)}
        </CanvasNodeMenuItem>
      ) : null}
    </>
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
