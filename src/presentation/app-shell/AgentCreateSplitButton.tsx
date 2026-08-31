import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from 'react'
import { createPortal } from 'react-dom'

import type { CreatableAgentProviderSnapshot } from '../../contexts/agent/application/dto/AgentProviderDiscoverySnapshot'
import { createAgentCreateMenuHighlightMotionController } from './agentCreateMenuHighlightMotion'
import { AgentProviderIcon } from './AgentProviderIcon'
import { CanvasMenuSurface } from './CanvasMenuMotionProvider'
import { useI18n } from '../i18n/useI18n'
import { TooltipLabel } from '../shared/components/Tooltip'
import { usePrefersReducedMotion } from '../shared/hooks/usePrefersReducedMotion'
import { WorkbenchIcon } from './WorkbenchIcons'

interface AgentCreateSplitButtonProps {
  readonly defaultProviderId: string | null
  readonly disabled: boolean
  readonly isCreating: boolean
  readonly providers: readonly CreatableAgentProviderSnapshot[]
  readonly shortcutTooltip: string
  readonly onCreate: (providerId?: string) => void
  readonly onOpenAgentSettings: () => void
  readonly onSelectDefault: (providerId: string) => void
}

export function AgentCreateSplitButton(props: AgentCreateSplitButtonProps) {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const highlightRef = useRef<HTMLSpanElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const highlightMotion = useMemo(() => createAgentCreateMenuHighlightMotionController(), [])
  const reducedMotion = usePrefersReducedMotion()
  const [menuPosition, setMenuPosition] = useState<{
    readonly anchorX: number
    readonly anchorY: number
    readonly left: number
    readonly side: 'bottom' | 'top'
    readonly top: number
  } | null>(null)
  const [isMenuPresent, setIsMenuPresent] = useState(false)
  const isDisabled = props.disabled || props.isCreating
  const defaultProvider =
    props.providers.find((provider) => provider.descriptor.id === props.defaultProviderId) ?? null

  const closeMenu = useCallback((): void => {
    setIsOpen(false)
    triggerRef.current?.focus()
  }, [])

  const activateMenuHighlight = useCallback(
    (item: HTMLButtonElement): void => {
      const highlight = highlightRef.current
      if (!highlight) return
      highlightMotion.moveTo(highlight, {
        height: item.offsetHeight,
        top: item.offsetTop
      })
    },
    [highlightMotion]
  )

  const handleMenuPointerLeave = useCallback((): void => {
    const focusedItem = itemRefs.current.find((item) => item === document.activeElement)
    if (focusedItem) {
      activateMenuHighlight(focusedItem)
      return
    }
    const highlight = highlightRef.current
    if (highlight) highlightMotion.hide(highlight)
  }, [activateMenuHighlight, highlightMotion])

  useLayoutEffect(() => {
    highlightMotion.setReducedMotion(reducedMotion)
  }, [highlightMotion, reducedMotion])

  useEffect(() => () => highlightMotion.dispose(), [highlightMotion])

  useEffect(() => {
    if (!isOpen) return undefined
    menuRef.current?.focus({ preventScroll: true })
    const closeOutside = (event: globalThis.PointerEvent): void => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target) &&
        !menuRef.current?.contains(event.target)
      ) {
        closeMenu()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [closeMenu, isMenuPresent, isOpen])

  useLayoutEffect(() => {
    if (!isOpen) return undefined

    const positionMenu = (): void => {
      const trigger = triggerRef.current
      const menu = menuRef.current
      if (!trigger || !menu) return
      const triggerRect = trigger.getBoundingClientRect()
      const viewportPadding = 8
      const gap = 7
      const opensAbove =
        triggerRect.bottom + gap + menu.offsetHeight > window.innerHeight - viewportPadding &&
        triggerRect.top - gap - menu.offsetHeight >= viewportPadding
      const top = opensAbove ? triggerRect.top - gap - menu.offsetHeight : triggerRect.bottom + gap

      setMenuPosition({
        anchorX: triggerRect.right,
        anchorY: opensAbove ? triggerRect.top : triggerRect.bottom,
        left: Math.min(
          Math.max(viewportPadding, triggerRect.right - menu.offsetWidth),
          Math.max(viewportPadding, window.innerWidth - menu.offsetWidth - viewportPadding)
        ),
        side: opensAbove ? 'top' : 'bottom',
        top: Math.min(
          Math.max(viewportPadding, top),
          Math.max(viewportPadding, window.innerHeight - menu.offsetHeight - viewportPadding)
        )
      })
    }

    positionMenu()
    window.addEventListener('resize', positionMenu)
    window.addEventListener('scroll', positionMenu, true)
    return () => {
      window.removeEventListener('resize', positionMenu)
      window.removeEventListener('scroll', positionMenu, true)
    }
  }, [isMenuPresent, isOpen, props.providers.length])

  const openMenu = (): void => {
    setIsOpen(true)
  }

  const handleItemKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    itemIndex: number,
    onSelect: () => void
  ): void => {
    const itemCount = props.providers.length + 1
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect()
      return
    }
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? itemCount - 1
          : event.key === 'ArrowDown'
            ? (itemIndex + 1) % itemCount
            : event.key === 'ArrowUp'
              ? (itemIndex - 1 + itemCount) % itemCount
              : null
    if (nextIndex === null) return
    event.preventDefault()
    itemRefs.current[nextIndex]?.focus()
  }

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu()
      return
    }
    const nextIndex =
      event.key === 'ArrowDown' || event.key === 'Home'
        ? 0
        : event.key === 'ArrowUp' || event.key === 'End'
          ? props.providers.length
          : null
    if (nextIndex === null) return
    event.preventDefault()
    itemRefs.current[nextIndex]?.focus()
  }

  return (
    <div className="agent-create-split" data-disabled={isDisabled} ref={rootRef}>
      <TooltipLabel content={props.shortcutTooltip} side="bottom">
        <button
          aria-label={t('toolbar.newAgent')}
          className="toolbar-button agent-create-split__main"
          disabled={isDisabled}
          type="button"
          onClick={() => (props.defaultProviderId ? props.onCreate() : props.onOpenAgentSettings())}
        >
          {props.isCreating ? (
            <WorkbenchIcon className="agent-create-split__spinner" role="loading" size={16} />
          ) : defaultProvider ? (
            <AgentProviderIcon icon={defaultProvider.descriptor.icon} />
          ) : (
            <WorkbenchIcon role="agent" size={16} />
          )}
          {t(props.isCreating ? 'toolbar.creatingAgent' : 'toolbar.newAgent')}
        </button>
      </TooltipLabel>
      <button
        ref={triggerRef}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={t('toolbar.chooseDefaultAgent')}
        className="toolbar-button agent-create-split__trigger"
        disabled={isDisabled}
        type="button"
        onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
          event.stopPropagation()
          if (isOpen) closeMenu()
          else openMenu()
        }}
      >
        <WorkbenchIcon role="disclosure" size={14} />
      </button>
      {createPortal(
        <CanvasMenuSurface
          ref={menuRef}
          anchor={{ x: menuPosition?.anchorX ?? 0, y: menuPosition?.anchorY ?? 0 }}
          aria-label={t('toolbar.chooseDefaultAgent')}
          className="agent-create-menu"
          data-side={menuPosition?.side ?? 'bottom'}
          menuId="agent-create-menu"
          motionReady={menuPosition !== null}
          open={isOpen}
          role="menu"
          tabIndex={-1}
          style={{
            left: menuPosition?.left ?? 0,
            top: menuPosition?.top ?? 0,
            visibility: menuPosition ? 'visible' : 'hidden'
          }}
          onRequestClose={closeMenu}
          onPresenceChange={setIsMenuPresent}
          onPointerLeave={handleMenuPointerLeave}
          onKeyDown={handleMenuKeyDown}
        >
          <span ref={highlightRef} aria-hidden="true" className="agent-create-menu__highlight" />
          {props.providers.length === 0 ? (
            <div className="agent-create-menu__empty" role="status">
              {t('toolbar.noAvailableAgents')}
            </div>
          ) : (
            props.providers.map((provider, index) => {
              const providerId = provider.descriptor.id
              const select = (): void => {
                props.onSelectDefault(providerId)
                closeMenu()
                props.onCreate(providerId)
              }
              return (
                <button
                  ref={(element) => {
                    itemRefs.current[index] = element
                  }}
                  aria-checked={providerId === props.defaultProviderId}
                  className="agent-create-menu__item"
                  key={providerId}
                  role="menuitemradio"
                  type="button"
                  onClick={select}
                  onFocus={(event) => activateMenuHighlight(event.currentTarget)}
                  onKeyDown={(event) => handleItemKeyDown(event, index, select)}
                  onPointerEnter={(event) => activateMenuHighlight(event.currentTarget)}
                >
                  <span className="agent-create-menu__icon" aria-hidden="true">
                    <AgentProviderIcon icon={provider.descriptor.icon} />
                  </span>
                  <span>{provider.descriptor.displayName}</span>
                  <WorkbenchIcon
                    className="agent-create-menu__check"
                    data-visible={providerId === props.defaultProviderId}
                    role="confirm"
                    size={14}
                  />
                </button>
              )
            })
          )}
          <div className="agent-create-menu__separator" role="separator" />
          <button
            ref={(element) => {
              itemRefs.current[props.providers.length] = element
            }}
            className="agent-create-menu__item agent-create-menu__item--settings"
            role="menuitem"
            type="button"
            onClick={() => {
              closeMenu()
              props.onOpenAgentSettings()
            }}
            onFocus={(event) => activateMenuHighlight(event.currentTarget)}
            onKeyDown={(event) =>
              handleItemKeyDown(event, props.providers.length, () => {
                closeMenu()
                props.onOpenAgentSettings()
              })
            }
            onPointerEnter={(event) => activateMenuHighlight(event.currentTarget)}
          >
            <span className="agent-create-menu__icon" aria-hidden="true">
              <WorkbenchIcon role="settings" size={16} />
            </span>
            <span>{t('toolbar.agentSettings')}</span>
          </button>
        </CanvasMenuSurface>,
        document.body
      )}
    </div>
  )
}
