import { Bot, Check, ChevronDown, LoaderCircle, Settings } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from 'react'

import type { CreatableAgentProviderSnapshot } from '../../contexts/agent/application/dto/AgentProviderDiscoverySnapshot'
import { AgentProviderIcon } from './AgentProviderIcon'
import { useI18n } from './i18n/useI18n'
import { TooltipLabel } from './Tooltip'

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
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const isDisabled = props.disabled || props.isCreating
  const defaultProvider =
    props.providers.find((provider) => provider.descriptor.id === props.defaultProviderId) ?? null

  const closeMenu = useCallback((): void => {
    setIsOpen(false)
    triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!isOpen) return undefined
    const selectedIndex = props.providers.findIndex(
      (provider) => provider.descriptor.id === props.defaultProviderId
    )
    itemRefs.current[selectedIndex >= 0 ? selectedIndex : 0]?.focus()
    const closeOutside = (event: globalThis.PointerEvent): void => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        closeMenu()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [closeMenu, isOpen, props.defaultProviderId, props.providers])

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
            <LoaderCircle className="agent-create-split__spinner" size={16} aria-hidden="true" />
          ) : defaultProvider ? (
            <AgentProviderIcon icon={defaultProvider.descriptor.icon} />
          ) : (
            <Bot size={16} aria-hidden="true" />
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
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {isOpen ? (
        <div aria-label={t('toolbar.chooseDefaultAgent')} className="agent-create-menu" role="menu">
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
                  onKeyDown={(event) => handleItemKeyDown(event, index, select)}
                >
                  <span className="agent-create-menu__icon" aria-hidden="true">
                    <AgentProviderIcon icon={provider.descriptor.icon} />
                  </span>
                  <span>{provider.descriptor.displayName}</span>
                  <Check
                    className="agent-create-menu__check"
                    data-visible={providerId === props.defaultProviderId}
                    size={14}
                    aria-hidden="true"
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
            onKeyDown={(event) =>
              handleItemKeyDown(event, props.providers.length, () => {
                closeMenu()
                props.onOpenAgentSettings()
              })
            }
          >
            <span className="agent-create-menu__icon" aria-hidden="true">
              <Settings size={16} />
            </span>
            <span>{t('toolbar.agentSettings')}</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}
