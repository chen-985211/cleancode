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
import { restoreCanvasMenuFocus } from './canvasMenuFocus'
import { CanvasNodeMenu, CanvasNodeMenuItem } from './CanvasNodeMenu'
import { useI18n } from '../i18n/useI18n'
import { WorkbenchIcon } from '../shared/components/WorkbenchIcons'

interface CanvasPaneContextMenuProps {
  readonly canCreateTerminal: boolean
  readonly canGroupTerminals: boolean
  readonly open: boolean
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
  open,
  position,
  shortcutTooltips,
  onClose,
  onCreateTerminal,
  onGroupTerminals
}: CanvasPaneContextMenuProps) {
  const { t } = useI18n()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)
  const [isMenuPresent, setIsMenuPresent] = useState(open)
  const [resolvedPosition, setResolvedPosition] = useState<{
    readonly left: number
    readonly top: number
    readonly pointerX: number
    readonly pointerY: number
  } | null>(null)

  useEffect(() => {
    if (!open) return undefined
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()

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
  }, [isMenuPresent, onClose, open])

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
        pointerX: position.x,
        pointerY: position.y
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    return () => window.removeEventListener('resize', updatePosition)
  }, [isMenuPresent, position.x, position.y])

  const createTerminalLabel = t('toolbar.newTerminal')
  const groupTerminalsLabel = t('toolbar.groupTerminals')
  const motionReady =
    resolvedPosition?.pointerX === position.x && resolvedPosition.pointerY === position.y

  return createPortal(
    <CanvasNodeMenu
      ref={menuRef}
      anchor={position}
      menuId="canvas-pane-context-menu"
      motionReady={motionReady}
      open={open}
      role="menu"
      aria-label={t('canvas.contextMenu.canvasActions')}
      onRequestClose={onClose}
      onPresenceChange={setIsMenuPresent}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onClose()
      }}
      onKeyDown={(event) => keepMenuItemFocused(event, menuRef.current)}
      style={{
        left: motionReady ? (resolvedPosition?.left ?? 0) : 0,
        top: motionReady ? (resolvedPosition?.top ?? 0) : 0,
        visibility: motionReady ? 'visible' : 'hidden'
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
