import { focusChoiceMenu, navigateChoiceMenu } from '../../../shared/menus/choiceMenuNavigation'
import { useMenuOptionHighlightMotion } from '../../../shared/hooks/useMenuOptionHighlightMotion'
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check'
import { TranslateIcon } from '@phosphor-icons/react/dist/csr/Translate'
import { useEffect, useRef, useState } from 'react'

import { useI18n } from '../../../i18n/useI18n'
import { AnchoredSurfaceMotion } from '../../shell/AppShellSurfaceMotion'
import { TooltipLabel } from '../../../shared/components/Tooltip'
import { localeDefinitions, supportedLocales, type Locale } from '../../../i18n/locale'
import { useToolbarUtilityButtonMotion } from '../../../shared/hooks/useToolbarUtilityButtonMotion'

export function LanguageSettingsRoot() {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const initialFocus = useRef<'container' | 'first' | 'last'>('container')
  const { highlightRef, interactionProps } = useMenuOptionHighlightMotion()
  const triggerMotionProps = useToolbarUtilityButtonMotion(triggerRef)
  const { locale, selectLocale, t } = useI18n()

  const closeMenu = (): void => {
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    focusChoiceMenu(menuRef.current, initialFocus.current)
    return undefined
  }, [isOpen])

  return (
    <div className="language-settings">
      {isOpen ? (
        <div
          className="language-settings-dismiss-layer"
          aria-hidden="true"
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            closeMenu()
          }}
        />
      ) : null}
      <TooltipLabel content={t('language.settings')} side="bottom">
        <button
          ref={triggerRef}
          className="language-settings-trigger toolbar-utility-button"
          type="button"
          aria-label={t('language.settings')}
          aria-controls="language-settings-menu"
          aria-expanded={isOpen}
          aria-haspopup="menu"
          {...triggerMotionProps}
          onClick={() => {
            initialFocus.current = 'container'
            setIsOpen((current) => !current)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
            event.preventDefault()
            event.stopPropagation()
            initialFocus.current = event.key === 'ArrowDown' ? 'first' : 'last'
            setIsOpen(true)
          }}
        >
          <TranslateIcon size={18} weight="bold" aria-hidden="true" />
        </button>
      </TooltipLabel>
      <AnchoredSurfaceMotion
        ref={menuRef}
        tabIndex={-1}
        {...interactionProps}
        onKeyDown={(event) => navigateChoiceMenu(event, closeMenu)}
        data-side="bottom"
        id="language-settings-menu"
        className="language-settings-menu anchored-surface-motion directional-menu-surface menu-option-highlight-container"
        springPreset="directional-menu"
        role="menu"
        aria-label={t('language.settings')}
        open={isOpen}
      >
        <span ref={highlightRef} aria-hidden="true" className="menu-option-highlight-motion" />
        {supportedLocales.map((optionLocale) => (
          <button
            key={optionLocale}

            className="language-settings-option menu-option-highlight-target"
            data-menu-option-highlight
            type="button"
            role="menuitemradio"
            aria-checked={locale === optionLocale}
            onClick={() => chooseLocale(optionLocale)}
          >
            <span>{t(localeDefinitions[optionLocale].labelKey)}</span>
            {locale === optionLocale ? (
              <CheckIcon size={17} weight="bold" aria-hidden="true" />
            ) : null}
          </button>
        ))}
      </AnchoredSurfaceMotion>
    </div>
  )

  function chooseLocale(nextLocale: Locale): void {
    selectLocale(nextLocale)
    closeMenu()
  }
}
