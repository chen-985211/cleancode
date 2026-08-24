import { CaretUpIcon } from '@phosphor-icons/react/dist/csr/CaretUp'
import { CodeIcon } from '@phosphor-icons/react/dist/csr/Code'
import { FolderOpenIcon } from '@phosphor-icons/react/dist/csr/FolderOpen'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'

import type {
  WorkspaceExternalOpenCapabilitiesSnapshot,
  WorkspaceExternalOpenTarget
} from '../../contexts/project/application/dto/WorkspaceExternalOpen'
import { AnchoredSurfaceMotion } from './SurfaceMotion'
import { TooltipLabel } from './Tooltip'
import { useI18n } from './i18n/useI18n'
import { useOutsidePointerDismiss } from './useOutsidePointerDismiss'

interface WorkspaceExternalOpenControlProps {
  readonly capabilities: WorkspaceExternalOpenCapabilitiesSnapshot
  readonly isPending: boolean
  readonly onOpen: (target: WorkspaceExternalOpenTarget) => Promise<void> | void
}

interface MenuPosition {
  readonly left: number
  readonly top: number
}

export function WorkspaceExternalOpenControl({
  capabilities,
  isPending,
  onOpen
}: WorkspaceExternalOpenControlProps) {
  const { t } = useI18n()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const controlRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const pendingInitialFocusRef = useRef(false)
  const menuId = useId()
  const triggerId = useId()

  useOutsidePointerDismiss({
    active: isMenuOpen,
    isInside: (target) =>
      controlRef.current?.contains(target) === true || menuRef.current?.contains(target) === true,
    onDismiss: () => {
      setIsMenuOpen(false)
      menuTriggerRef.current?.focus({ preventScroll: true })
    },
    pointerPolicy: 'consume'
  })

  useEffect(() => {
    if (!isMenuOpen) return undefined

    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setIsMenuOpen(false)
      menuTriggerRef.current?.focus({ preventScroll: true })
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [isMenuOpen])

  useEffect(() => {
    if (!isMenuOpen || !menuPosition || !pendingInitialFocusRef.current) return
    pendingInitialFocusRef.current = false
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [isMenuOpen, menuPosition])

  useLayoutEffect(() => {
    if (!isMenuOpen) return undefined

    const positionMenu = (): void => {
      const control = controlRef.current
      const menu = menuRef.current
      if (!control || !menu) return

      setMenuPosition(
        resolveMenuPosition({
          menuHeight: menu.offsetHeight,
          menuWidth: menu.offsetWidth,
          triggerRect: control.getBoundingClientRect(),
          viewportHeight: window.innerHeight,
          viewportWidth: window.innerWidth
        })
      )
    }

    positionMenu()
    window.addEventListener('resize', positionMenu)
    return () => window.removeEventListener('resize', positionMenu)
  }, [isMenuOpen])

  if (!capabilities.vscode.available) {
    return (
      <div className="workspace-external-open-control">
        <TooltipLabel content={t('workspaceExternalOpen.folder')}>
          <button
            className="workspace-external-open-control__button"
            type="button"
            aria-label={t('workspaceExternalOpen.folder')}
            disabled={isPending}
            onClick={() => void onOpen('folder')}
          >
            <FolderOpenIcon size={14} weight="bold" aria-hidden="true" />
          </button>
        </TooltipLabel>
      </div>
    )
  }

  return (
    <>
      <div
        ref={controlRef}
        className="workspace-external-open-control workspace-external-open-control--split"
        role="group"
        aria-label={t('workspaceExternalOpen.group')}
      >
        <TooltipLabel content={t('workspaceExternalOpen.vscode')}>
          <button
            className="workspace-external-open-control__button workspace-external-open-control__button--primary"
            type="button"
            aria-label={t('workspaceExternalOpen.vscode')}
            disabled={isPending}
            onClick={() => void onOpen('vscode')}
          >
            <WorkspaceEditorIcon iconDataUrl={capabilities.vscode.iconDataUrl} />
          </button>
        </TooltipLabel>
        <TooltipLabel content={t('workspaceExternalOpen.choose')}>
          <button
            ref={menuTriggerRef}
            id={triggerId}
            className="workspace-external-open-control__button workspace-external-open-control__button--menu"
            type="button"
            aria-controls={isMenuOpen ? menuId : undefined}
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            aria-label={t('workspaceExternalOpen.choose')}
            disabled={isPending}
            onClick={() => toggleMenu()}
            onKeyDown={(event) => {
              if (isMenuOpen || !['ArrowDown', 'ArrowUp'].includes(event.key)) return
              event.preventDefault()
              toggleMenu(true)
            }}
          >
            <CaretUpIcon size={11} weight="bold" aria-hidden="true" />
          </button>
        </TooltipLabel>
      </div>
      <AnchoredSurfaceMotion
        ref={menuRef}
        id={menuId}
        className="workspace-external-open-menu anchored-surface-motion"
        data-side="top"
        open={isMenuOpen}
        portalContainer={document.body}
        role="menu"
        aria-labelledby={triggerId}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsMenuOpen(false)
          }
        }}
        onKeyDown={(event) => moveMenuFocus(event, menuRef.current)}
        style={{
          left: menuPosition?.left ?? 0,
          top: menuPosition?.top ?? 0,
          visibility: menuPosition ? 'visible' : 'hidden'
        }}
      >
        <button
          className="workspace-external-open-menu__item"
          type="button"
          role="menuitem"
          disabled={isPending}
          onClick={() => selectTarget('vscode')}
        >
          <WorkspaceEditorIcon iconDataUrl={capabilities.vscode.iconDataUrl} />
          {t('workspaceExternalOpen.vscode')}
        </button>
        <button
          className="workspace-external-open-menu__item"
          type="button"
          role="menuitem"
          disabled={isPending}
          onClick={() => selectTarget('folder')}
        >
          <FolderOpenIcon size={15} weight="bold" aria-hidden="true" />
          {t('workspaceExternalOpen.folder')}
        </button>
      </AnchoredSurfaceMotion>
    </>
  )

  function toggleMenu(focusFirstItem = false): void {
    setMenuPosition(null)
    pendingInitialFocusRef.current = focusFirstItem || !isMenuOpen
    setIsMenuOpen((open) => !open)
  }

  function selectTarget(target: WorkspaceExternalOpenTarget): void {
    setIsMenuOpen(false)
    menuTriggerRef.current?.focus({ preventScroll: true })
    void onOpen(target)
  }
}

function WorkspaceEditorIcon({ iconDataUrl }: { readonly iconDataUrl: string | null }) {
  return iconDataUrl ? (
    <img className="workspace-external-open-control__app-icon" src={iconDataUrl} alt="" />
  ) : (
    <CodeIcon size={14} weight="bold" aria-hidden="true" />
  )
}

function resolveMenuPosition(input: {
  readonly menuHeight: number
  readonly menuWidth: number
  readonly triggerRect: DOMRect
  readonly viewportHeight: number
  readonly viewportWidth: number
}): MenuPosition {
  const viewportPadding = 8
  const gap = 6
  const maximumLeft = Math.max(
    viewportPadding,
    input.viewportWidth - input.menuWidth - viewportPadding
  )
  const maximumTop = Math.max(
    viewportPadding,
    input.viewportHeight - input.menuHeight - viewportPadding
  )

  return {
    left: Math.min(Math.max(viewportPadding, input.triggerRect.left), maximumLeft),
    top: Math.min(
      Math.max(viewportPadding, input.triggerRect.top - gap - input.menuHeight),
      maximumTop
    )
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
