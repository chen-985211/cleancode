import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'

import { TooltipLabel } from '../../../shared/components/Tooltip'
import { WorkbenchIcon } from '../../../shared/components/WorkbenchIcons'
import { useOutsidePointerDismiss } from '../../../shared/hooks/useOutsidePointerDismiss'
import { focusChoiceMenu, navigateChoiceMenu } from '../../../shared/menus/choiceMenuNavigation'
import { CanvasNodeMenu } from './CanvasNodeMenu'
import { resolveCanvasObjectContextMenuPosition } from './canvasObjectContextMenuPosition'

interface CanvasNodeMoreMenuProps {
  readonly label: string
  readonly tooltip: string
  readonly triggerClassName: string
  readonly controlSurface?: 'raised'
  readonly iconName?: string
  readonly children: (close: () => void) => ReactNode
}

export function CanvasNodeMoreMenu({
  label,
  tooltip,
  triggerClassName,
  controlSurface,
  iconName,
  children
}: CanvasNodeMoreMenuProps) {
  const [open, setOpen] = useState(false)
  const [present, setPresent] = useState(false)
  const [position, setPosition] = useState<{
    left: number
    top: number
    x: number
    y: number
  } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const initialFocus = useRef<'first' | 'last'>('first')
  const wasOpen = useRef(false)
  const close = useCallback(() => setOpen(false), [])
  useLayoutEffect(() => {
    const trigger = triggerRef.current
    if (wasOpen.current && !open && !trigger?.closest('[inert], [aria-hidden="true"]')) {
      trigger?.focus({ preventScroll: true })
    }
    wasOpen.current = open
  }, [open])
  useOutsidePointerDismiss({
    active: open,
    isInside: (target) =>
      Boolean(triggerRef.current?.contains(target) || menuRef.current?.contains(target)),
    onDismiss: close,
    pointerPolicy: 'consume'
  })
  useLayoutEffect(() => {
    const anchor = triggerRef.current
    const menu = menuRef.current
    if (!open || !anchor || !menu) return
    let frame: number | null = null
    const place = () => {
      frame = null
      if (anchor.closest('[inert], [aria-hidden="true"]')) {
        setOpen(false)
        return
      }
      const rect = anchor.getBoundingClientRect()
      const above =
        rect.bottom + menu.offsetHeight + 8 > window.innerHeight && rect.top > menu.offsetHeight + 8
      const point = { x: rect.right, y: above ? rect.top : rect.bottom }
      setPosition({
        ...point,
        ...resolveCanvasObjectContextMenuPosition({
          menuWidth: menu.offsetWidth,
          menuHeight: menu.offsetHeight,
          pointerX: rect.right - menu.offsetWidth - 4,
          pointerY: above ? rect.top - menu.offsetHeight - 8 : rect.bottom,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight
        })
      })
    }
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(place)
    }
    const mutations = new MutationObserver(schedule)
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    for (let element: HTMLElement | null = anchor; element; element = element.parentElement) {
      mutations.observe(element, {
        attributes: true,
        attributeFilter: ['style', 'class', 'inert', 'aria-hidden']
      })
      resize?.observe(element)
    }
    resize?.observe(menu)
    window.addEventListener('resize', schedule)
    document.addEventListener('scroll', schedule, true)
    place()
    return () => {
      mutations.disconnect()
      resize?.disconnect()
      window.removeEventListener('resize', schedule)
      document.removeEventListener('scroll', schedule, true)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [open, present])
  useEffect(() => {
    if (open && present) focusChoiceMenu(menuRef.current, initialFocus.current)
  }, [open, present])
  return (
    <span
      className="nodrag nopan nowheel"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <TooltipLabel content={tooltip}>
        <button
          className={triggerClassName}
          data-control-surface={controlSurface}
          type="button"
          ref={triggerRef}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => {
            initialFocus.current = 'first'
            setOpen(!open)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
            event.preventDefault()
            event.stopPropagation()
            initialFocus.current = event.key === 'ArrowUp' ? 'last' : 'first'
            setOpen(true)
          }}
        >
          <WorkbenchIcon role="more" data-icon={iconName} size={18} />
        </button>
      </TooltipLabel>
      {createPortal(
        <CanvasNodeMenu
          ref={menuRef}
          id={menuId}
          menuId={menuId}
          open={open}
          motionReady={position !== null}
          anchor={position ?? { x: 0, y: 0 }}
          onRequestClose={close}
          onPresenceChange={setPresent}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          data-shortcut-capture=""
          style={{ left: position?.left ?? 0, top: position?.top ?? 0 }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
          onKeyDown={(event) => navigateChoiceMenu(event, close)}
        >
          {children(close)}
        </CanvasNodeMenu>,
        document.body
      )}
    </span>
  )
}
