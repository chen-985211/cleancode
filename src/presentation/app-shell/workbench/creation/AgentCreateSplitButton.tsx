import {
  focusChoiceMenu,
  navigateChoiceMenu,
  type ChoiceMenuInitialFocus
} from '../../../shared/menus/choiceMenuNavigation'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from 'react'
import { createPortal } from 'react-dom'

import type { CreatableAgentProviderSnapshot } from '../../../../contexts/agent/application/dto/AgentProviderDiscoverySnapshot'
import { AgentProviderIcon } from '../../../../contexts/agent/presentation/components/AgentProviderIcon'
import { CanvasMenuSurface } from '../menus/CanvasMenuMotionProvider'
import { useI18n } from '../../../i18n/useI18n'
import { TooltipLabel } from '../../../shared/components/Tooltip'
import { useMenuOptionHighlightMotion } from '../../../shared/hooks/useMenuOptionHighlightMotion'
import { WorkbenchIcon } from '../../../shared/components/WorkbenchIcons'

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
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const initialFocus = useRef<ChoiceMenuInitialFocus>('container')
  const { highlightRef, interactionProps: highlightInteractionProps } =
    useMenuOptionHighlightMotion()
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

  useEffect(() => {
    if (!isOpen) return undefined
    focusChoiceMenu(menuRef.current, initialFocus.current)
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
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          event.stopPropagation()
          initialFocus.current = event.key === 'ArrowDown' ? 'first' : 'last'
          if (isOpen) focusChoiceMenu(menuRef.current, initialFocus.current)
          else openMenu()
        }}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={t('toolbar.chooseDefaultAgent')}
        className="toolbar-button agent-create-split__trigger directional-menu-trigger"
        disabled={isDisabled}
        type="button"
        onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
          event.stopPropagation()
          if (isOpen) closeMenu()
          else {
            initialFocus.current = 'container'
            openMenu()
          }
        }}
      >
        <WorkbenchIcon role="disclosure" size={14} />
      </button>
      {createPortal(
        <CanvasMenuSurface
          ref={menuRef}
          anchor={{ x: menuPosition?.anchorX ?? 0, y: menuPosition?.anchorY ?? 0 }}
          aria-label={t('toolbar.chooseDefaultAgent')}
          className="agent-create-menu directional-menu-surface menu-option-highlight-container"
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
          {...highlightInteractionProps}
          onKeyDown={(event) => navigateChoiceMenu(event, closeMenu)}
        >
          <span ref={highlightRef} aria-hidden="true" className="menu-option-highlight-motion" />
          {props.providers.length === 0 ? (
            <div className="agent-create-menu__empty" role="status">
              {t('toolbar.noAvailableAgents')}
            </div>
          ) : (
            props.providers.map((provider) => {
              const providerId = provider.descriptor.id
              const select = (): void => {
                props.onSelectDefault(providerId)
                closeMenu()
                props.onCreate(providerId)
              }
              return (
                <button
                  aria-checked={providerId === props.defaultProviderId}
                  className="agent-create-menu__item menu-option-highlight-target"
                  data-menu-option-highlight
                  key={providerId}
                  role="menuitemradio"
                  type="button"
                  onClick={select}
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
            className="agent-create-menu__item agent-create-menu__item--settings menu-option-highlight-target"
            data-menu-option-highlight
            role="menuitem"
            type="button"
            onClick={() => {
              closeMenu()
              props.onOpenAgentSettings()
            }}
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
