import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'
import { createPortal } from 'react-dom'

import type { ApplicationShortcutTooltipLabels } from './applicationShortcutTooltips'
import { resolveCanvasObjectContextMenuPosition } from './canvasObjectContextMenuPosition'
import { CanvasNodeMenu, CanvasNodeMenuItem } from './CanvasNodeMenu'
import { useI18n } from './i18n/useI18n'
import { WorkbenchIcon } from './WorkbenchIcons'

interface CanvasPaneContextMenuProps {
  readonly canCreateTerminal: boolean
  readonly canGroupTerminals: boolean
  readonly position: { readonly x: number; readonly y: number }
  readonly shortcutTooltips: Pick<
    ApplicationShortcutTooltipLabels,
    'createTerminal' | 'groupTerminals'
  >
  readonly onClose: () => void
  readonly onCreateTerminal: () => void
  readonly onGroupTerminals: () => void
}

export function CanvasPaneContextMenu({
  canCreateTerminal,
  canGroupTerminals,
  position,
  shortcutTooltips,
  onClose,
  onCreateTerminal,
  onGroupTerminals
}: CanvasPaneContextMenuProps) {
  const { t } = useI18n()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [resolvedPosition, setResolvedPosition] = useState<{
    readonly left: number
    readonly top: number
  } | null>(null)

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()

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

  const createTerminalLabel = t('toolbar.newTerminal')
  const groupTerminalsLabel = t('toolbar.groupTerminals')

  return createPortal(
    <CanvasNodeMenu
      ref={menuRef}
      role="menu"
      aria-label={t('canvas.contextMenu.canvasActions')}
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
      <CanvasPaneContextMenuItem
        disabled={!canCreateTerminal}
        iconRole="terminal"
        label={createTerminalLabel}
        shortcut={readShortcutHint(shortcutTooltips.createTerminal, createTerminalLabel)}
        onSelect={() => {
          onClose()
          onCreateTerminal()
        }}
      />
      <CanvasPaneContextMenuItem
        disabled={!canGroupTerminals}
        iconRole="terminal-group"
        label={groupTerminalsLabel}
        shortcut={readShortcutHint(shortcutTooltips.groupTerminals, groupTerminalsLabel)}
        onSelect={() => {
          onClose()
          onGroupTerminals()
        }}
      />
    </CanvasNodeMenu>,
    document.body
  )
}

function CanvasPaneContextMenuItem({
  disabled,
  iconRole,
  label,
  shortcut,
  onSelect
}: {
  readonly disabled: boolean
  readonly iconRole: 'terminal' | 'terminal-group'
  readonly label: string
  readonly shortcut: string | null
  readonly onSelect: () => void
}) {
  return (
    <CanvasNodeMenuItem type="button" role="menuitem" disabled={disabled} onClick={onSelect}>
      <WorkbenchIcon role={iconRole} size={16} />
      <span className="canvas-pane-context-menu__label">{label}</span>
      {shortcut ? (
        <span className="canvas-pane-context-menu__shortcut" aria-hidden="true">
          {shortcut}
        </span>
      ) : null}
    </CanvasNodeMenuItem>
  )
}

function readShortcutHint(tooltip: string, action: string): string | null {
  const prefix = `${action} (`
  return tooltip.startsWith(prefix) && tooltip.endsWith(')')
    ? tooltip.slice(prefix.length, -1)
    : null
}

function keepMenuItemFocused(
  event: ReactKeyboardEvent<HTMLElement>,
  menu: HTMLElement | null
): void {
  if (!menu || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const items = Array.from(
    menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
  )
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
