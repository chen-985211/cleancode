import { ArchiveIcon } from '@phosphor-icons/react/dist/csr/Archive'
import { DotsThreeIcon } from '@phosphor-icons/react/dist/csr/DotsThree'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'

import { AnchoredSurfaceMotion } from './AppShellSurfaceMotion'
import { TooltipLabel } from '../shared/components/Tooltip'
import { useI18n } from '../i18n/useI18n'
import { useOutsidePointerDismiss } from '../shared/hooks/useOutsidePointerDismiss'

interface WorkspaceRowMenuPosition {
  readonly left: number
  readonly side: 'bottom' | 'top'
  readonly top: number
}

interface WorkspaceRowMenuProps {
  readonly isOpen: boolean
  readonly onArchive: () => void
  readonly onClose: () => void
  readonly onToggle: () => void
  readonly workspaceName: string
}

export function WorkspaceRowMenu({
  isOpen,
  onArchive,
  onClose,
  onToggle,
  workspaceName
}: WorkspaceRowMenuProps) {
  const { t } = useI18n()
  const [menuPosition, setMenuPosition] = useState<WorkspaceRowMenuPosition | null>(null)
  const menuId = useId()
  const triggerId = useId()
  const pendingInitialFocusRef = useRef(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useOutsidePointerDismiss({
    active: isOpen,
    isInside: (target) =>
      triggerRef.current?.contains(target) === true || menuRef.current?.contains(target) === true,
    onDismiss: () => {
      onClose()
      triggerRef.current?.focus({ preventScroll: true })
    },
    pointerPolicy: 'consume'
  })

  useEffect(() => {
    if (!isOpen) return undefined

    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      onClose()
      triggerRef.current?.focus()
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen || !menuPosition || !pendingInitialFocusRef.current) return
    pendingInitialFocusRef.current = false
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [isOpen, menuPosition])

  useLayoutEffect(() => {
    if (!isOpen) return undefined

    const positionMenu = (): void => {
      const trigger = triggerRef.current
      const menu = menuRef.current
      if (!trigger || !menu) return

      setMenuPosition(
        resolveWorkspaceRowMenuPosition({
          menuHeight: menu.offsetHeight,
          menuWidth: menu.offsetWidth,
          triggerRect: trigger.getBoundingClientRect(),
          viewportHeight: window.innerHeight,
          viewportWidth: window.innerWidth
        })
      )
    }

    positionMenu()
    window.addEventListener('resize', positionMenu)
    window.addEventListener('scroll', positionMenu, true)
    return () => {
      window.removeEventListener('resize', positionMenu)
      window.removeEventListener('scroll', positionMenu, true)
    }
  }, [isOpen])

  return (
    <>
      <TooltipLabel content={t('sidebar.more')}>
        <button
          id={triggerId}
          className="workspace-row__menu-button"
          ref={triggerRef}
          type="button"
          aria-controls={isOpen ? menuId : undefined}
          aria-label={t('sidebar.openWorkspaceMenu', { workspaceName })}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          onClick={() => {
            setMenuPosition(null)
            pendingInitialFocusRef.current = !isOpen
            onToggle()
          }}
          onKeyDown={(event) => {
            if (isOpen || !['ArrowDown', 'ArrowUp'].includes(event.key)) return
            event.preventDefault()
            setMenuPosition(null)
            pendingInitialFocusRef.current = true
            onToggle()
          }}
        >
          <DotsThreeIcon size={15} weight="bold" aria-hidden="true" />
        </button>
      </TooltipLabel>
      <AnchoredSurfaceMotion
        open={isOpen}
        portalContainer={document.body}
        id={menuId}
        className="workspace-row-menu anchored-surface-motion"
        role="menu"
        aria-labelledby={triggerId}
        data-side={menuPosition?.side ?? 'bottom'}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            onClose()
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
        <button
          className="workspace-row-menu__item"
          type="button"
          role="menuitem"
          tabIndex={0}
          onClick={() => {
            onClose()
            onArchive()
          }}
        >
          <ArchiveIcon size={16} weight="bold" aria-hidden="true" />
          {t('sidebar.archiveWorkspace')}
        </button>
      </AnchoredSurfaceMotion>
    </>
  )
}

function resolveWorkspaceRowMenuPosition(input: {
  readonly menuHeight: number
  readonly menuWidth: number
  readonly triggerRect: DOMRect
  readonly viewportHeight: number
  readonly viewportWidth: number
}): WorkspaceRowMenuPosition {
  const viewportPadding = 8
  const gap = 6
  const horizontalOffset = 4
  const availableBelow = input.viewportHeight - viewportPadding - input.triggerRect.bottom - gap
  const availableAbove = input.triggerRect.top - viewportPadding - gap
  const opensAbove =
    input.menuHeight > availableBelow &&
    (input.menuHeight <= availableAbove || availableAbove > availableBelow)
  const preferredLeft = input.triggerRect.left - horizontalOffset
  const preferredTop = opensAbove
    ? input.triggerRect.top - gap - input.menuHeight
    : input.triggerRect.bottom + gap
  const maximumLeft = Math.max(
    viewportPadding,
    input.viewportWidth - input.menuWidth - viewportPadding
  )
  const maximumTop = Math.max(
    viewportPadding,
    input.viewportHeight - input.menuHeight - viewportPadding
  )

  return {
    left: Math.min(Math.max(viewportPadding, preferredLeft), maximumLeft),
    side: opensAbove ? 'top' : 'bottom',
    top: Math.min(Math.max(viewportPadding, preferredTop), maximumTop)
  }
}

function moveMenuFocus(event: ReactKeyboardEvent<HTMLElement>, menu: HTMLElement | null): void {
  if (!menu || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const items = Array.from(
    menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
  )
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
