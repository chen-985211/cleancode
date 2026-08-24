import { CaretUpIcon } from '@phosphor-icons/react/dist/csr/CaretUp'
import { FolderOpenIcon } from '@phosphor-icons/react/dist/csr/FolderOpen'
import {
  useCallback,
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
} from '../../application/dto/WorkspaceExternalOpen'
import { AnchoredSurfaceMotion } from '../../../../presentation/app-shell/SurfaceMotion'
import { TooltipLabel } from '../../../../presentation/app-shell/Tooltip'
import { useI18n } from '../../../../presentation/app-shell/i18n/useI18n'
import { useOutsidePointerDismiss } from '../../../../presentation/app-shell/useOutsidePointerDismiss'

interface WorkspaceExternalOpenControlProps {
  readonly capabilities: WorkspaceExternalOpenCapabilitiesSnapshot
  readonly isPending: boolean
  readonly onOpen: (target: WorkspaceExternalOpenTarget) => Promise<void> | void
}

type WorkspaceExternalOpenActionProps = Omit<WorkspaceExternalOpenControlProps, 'capabilities'>

interface MenuPosition {
  readonly left: number
  readonly top: number
}

type MenuInitialFocus = 'first' | 'last'

export function WorkspaceExternalOpenControl({
  capabilities,
  isPending,
  onOpen
}: WorkspaceExternalOpenControlProps) {
  if (!capabilities.vscode.available) {
    return <WorkspaceExternalFolderOpenControl isPending={isPending} onOpen={onOpen} />
  }

  return <WorkspaceExternalOpenSplitControl isPending={isPending} onOpen={onOpen} />
}

function WorkspaceExternalFolderOpenControl({
  isPending,
  onOpen
}: WorkspaceExternalOpenActionProps) {
  const { t } = useI18n()

  return (
    <div className="workspace-external-open-control">
      <TooltipLabel content={t('workspaceExternalOpen.folder')}>
        <button
          className="workspace-external-open-control__button"
          type="button"
          aria-label={t('workspaceExternalOpen.folder')}
          aria-disabled={isPending}
          onClick={() => {
            if (!isPending) void onOpen('folder')
          }}
        >
          <FolderOpenIcon size={14} weight="bold" aria-hidden="true" />
        </button>
      </TooltipLabel>
    </div>
  )
}

function WorkspaceExternalOpenSplitControl({
  isPending,
  onOpen
}: WorkspaceExternalOpenActionProps) {
  const { t } = useI18n()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const controlRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const pendingInitialFocusRef = useRef<MenuInitialFocus | null>(null)
  const menuId = useId()
  const triggerId = useId()
  const closeMenu = useCallback((restoreTriggerFocus = false): void => {
    pendingInitialFocusRef.current = null
    setIsMenuOpen(false)
    if (restoreTriggerFocus) menuTriggerRef.current?.focus({ preventScroll: true })
  }, [])

  useOutsidePointerDismiss({
    active: isMenuOpen,
    isInside: (target) =>
      controlRef.current?.contains(target) === true || menuRef.current?.contains(target) === true,
    onDismiss: () => {
      closeMenu(true)
    },
    pointerPolicy: 'consume'
  })

  useEffect(() => {
    if (!isMenuOpen) return undefined

    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      closeMenu(true)
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [closeMenu, isMenuOpen])

  useEffect(() => {
    const initialFocus = pendingInitialFocusRef.current
    if (!isMenuOpen || !menuPosition || !initialFocus) return

    pendingInitialFocusRef.current = null
    focusMenuBoundary(menuRef.current, initialFocus)
  }, [isMenuOpen, menuPosition])

  useLayoutEffect(() => {
    if (!isMenuOpen) return undefined

    const positionMenu = (): void => {
      const control = controlRef.current
      const menu = menuRef.current
      if (!control || !menu) return

      const nextPosition = resolveMenuPosition({
        menuHeight: menu.offsetHeight,
        menuWidth: menu.offsetWidth,
        triggerRect: control.getBoundingClientRect(),
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth
      })
      setMenuPosition((currentPosition) =>
        currentPosition?.left === nextPosition.left && currentPosition.top === nextPosition.top
          ? currentPosition
          : nextPosition
      )
    }

    positionMenu()
    const layoutOwner = controlRef.current?.parentElement ?? null
    let layoutObserver: MutationObserver | null = null
    if (typeof MutationObserver !== 'undefined' && layoutOwner) {
      layoutObserver = new MutationObserver(positionMenu)
      layoutObserver.observe(layoutOwner, {
        attributeFilter: ['data-project-sidebar-motion-state', 'style'],
        attributes: true
      })
    }
    window.addEventListener('resize', positionMenu)
    window.addEventListener('scroll', positionMenu, true)
    return () => {
      layoutObserver?.disconnect()
      window.removeEventListener('resize', positionMenu)
      window.removeEventListener('scroll', positionMenu, true)
    }
  }, [isMenuOpen])

  return (
    <>
      <div
        ref={controlRef}
        className="workspace-external-open-control workspace-external-open-control--split"
        data-menu-open={isMenuOpen}
        role="group"
        aria-label={t('workspaceExternalOpen.group')}
        onBlur={(event) => {
          if (!isWithinComposite(event.relatedTarget)) closeMenu()
        }}
      >
        <TooltipLabel content={t('workspaceExternalOpen.vscode')}>
          <button
            className="workspace-external-open-control__button workspace-external-open-control__button--primary"
            type="button"
            aria-label={t('workspaceExternalOpen.vscode')}
            aria-disabled={isPending}
            onClick={() => executeTarget('vscode')}
          >
            <WorkspaceEditorIcon />
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
            aria-disabled={isPending}
            onClick={() => toggleMenu()}
            onKeyDown={(event) => {
              if (isPending || !['ArrowDown', 'ArrowUp'].includes(event.key)) return
              event.preventDefault()
              const initialFocus = event.key === 'ArrowDown' ? 'first' : 'last'
              if (isMenuOpen) {
                if (!focusMenuBoundary(menuRef.current, initialFocus)) {
                  pendingInitialFocusRef.current = initialFocus
                }
                return
              }
              openMenu(initialFocus)
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
        springPreset="anchored-bottom-left"
        portalContainer={document.body}
        role="menu"
        aria-labelledby={triggerId}
        onExitComplete={() => {
          setMenuPosition(null)
        }}
        onBlur={(event) => {
          if (!isWithinComposite(event.relatedTarget)) closeMenu()
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
          <WorkspaceEditorIcon />
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

  function toggleMenu(): void {
    if (isPending) return
    if (isMenuOpen) {
      closeMenu()
      return
    }
    openMenu()
  }

  function selectTarget(target: WorkspaceExternalOpenTarget): void {
    closeMenu(true)
    void onOpen(target)
  }

  function executeTarget(target: WorkspaceExternalOpenTarget): void {
    if (isPending) return
    closeMenu()
    void onOpen(target)
  }

  function openMenu(initialFocus: MenuInitialFocus | null = null): void {
    pendingInitialFocusRef.current = initialFocus
    setIsMenuOpen(true)
  }

  function isWithinComposite(target: EventTarget | null): boolean {
    if (!(target instanceof Node)) return false
    return (
      controlRef.current?.contains(target) === true || menuRef.current?.contains(target) === true
    )
  }
}

function WorkspaceEditorIcon() {
  return <span className="workspace-external-open-control__app-icon" aria-hidden="true" />
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

  if (currentIndex < 0) {
    items[event.key === 'ArrowDown' ? 0 : items.length - 1]?.focus()
    return
  }

  const direction = event.key === 'ArrowDown' ? 1 : -1
  const nextIndex = (currentIndex + direction + items.length) % items.length
  items[nextIndex]?.focus()
}

function focusMenuBoundary(menu: HTMLElement | null, boundary: MenuInitialFocus): boolean {
  const items = menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
  if (!items || items.length === 0) return false

  items[boundary === 'first' ? 0 : items.length - 1]?.focus()
  return true
}
