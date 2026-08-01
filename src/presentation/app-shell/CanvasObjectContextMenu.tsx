import { Rocket, Star, Trash2 } from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'
import { createPortal } from 'react-dom'

import type { CanvasObjectContextTarget } from './canvasObjectContextTarget'
import { resolveCanvasObjectContextMenuPosition } from './canvasObjectContextMenuPosition'
import { useI18n } from './i18n/useI18n'

interface CanvasObjectContextMenuProps {
  readonly position: { readonly x: number; readonly y: number }
  readonly target: CanvasObjectContextTarget
  readonly onClose: () => void
  readonly onFavorite: (terminalBlockIds: readonly string[]) => void
  readonly onAddToQuickExecution?: (target: CanvasObjectContextTarget) => void
  readonly onRemove?: (target: CanvasObjectContextTarget) => void
}

export function CanvasObjectContextMenu({
  position,
  target,
  onClose,
  onFavorite,
  onAddToQuickExecution,
  onRemove
}: CanvasObjectContextMenuProps) {
  const { t } = useI18n()
  const menuRef = useRef<HTMLDivElement | null>(null)
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
  }, [onClose])

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
  }, [position.x, position.y])

  return createPortal(
    <div
      ref={menuRef}
      className="canvas-object-context-menu nodrag"
      role="menu"
      aria-label={t(`canvas.contextMenu.${target.kind}Actions`)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onClose()
      }}
      onKeyDown={(event) => keepMenuItemFocused(event, menuRef.current)}
      style={{
        left: resolvedPosition?.left ?? 0,
        top: resolvedPosition?.top ?? 0,
        visibility: resolvedPosition ? 'visible' : 'hidden'
      }}
    >
      <button
        className="canvas-object-context-menu__item"
        type="button"
        role="menuitem"
        onClick={() => {
          onClose()
          onFavorite(target.terminalBlockIds)
        }}
      >
        <Star size={16} fill="currentColor" aria-hidden="true" />
        {t(`canvas.contextMenu.favorite.${target.kind}`)}
      </button>
      {onAddToQuickExecution ? (
        <button
          className="canvas-object-context-menu__item"
          type="button"
          role="menuitem"
          onClick={() => {
            onClose()
            onAddToQuickExecution(target)
          }}
        >
          <Rocket size={16} aria-hidden="true" />
          {t('canvas.contextMenu.addToQuickExecution')}
        </button>
      ) : null}
      {target.kind !== 'terminal' && onRemove ? (
        <button
          className="canvas-object-context-menu__item"
          type="button"
          role="menuitem"
          onClick={() => {
            onClose()
            onRemove(target)
          }}
        >
          <Trash2 size={16} aria-hidden="true" />
          {t(`canvas.contextMenu.remove.${target.kind}`)}
        </button>
      ) : null}
    </div>,
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
