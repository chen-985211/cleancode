import { Check, Languages } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { useI18n } from './i18n/useI18n'
import { TooltipLabel } from './Tooltip'
import { supportedLocales, type Locale } from './i18n/locale'

export function LanguageSettingsRoot() {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const optionRefs = useRef(new Map<Locale, HTMLButtonElement>())
  const { locale, selectLocale, t } = useI18n()

  const closeMenu = (): void => {
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    optionRefs.current.get(locale)?.focus()
    const closeFromOutside = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeMenu()
      }
    }

    document.addEventListener('pointerdown', closeFromOutside)
    return () => document.removeEventListener('pointerdown', closeFromOutside)
  }, [isOpen, locale])

  return (
    <div ref={rootRef} className="language-settings">
      <TooltipLabel content={t('language.settings')} side="bottom">
        <button
          ref={triggerRef}
          className="language-settings-trigger"
          type="button"
          aria-label={t('language.settings')}
          aria-controls="language-settings-menu"
          aria-expanded={isOpen}
          aria-haspopup="menu"
          onClick={() => setIsOpen((current) => !current)}
        >
          <Languages size={18} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </TooltipLabel>
      {isOpen ? (
        <div
          id="language-settings-menu"
          className="language-settings-menu"
          role="menu"
          aria-label={t('language.settings')}
        >
          {supportedLocales.map((optionLocale, index) => (
            <button
              key={optionLocale}
              ref={(element) => {
                if (element) {
                  optionRefs.current.set(optionLocale, element)
                } else {
                  optionRefs.current.delete(optionLocale)
                }
              }}
              className="language-settings-option"
              type="button"
              role="menuitemradio"
              aria-checked={locale === optionLocale}
              onClick={() => chooseLocale(optionLocale)}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
            >
              <span>{languageLabel(optionLocale)}</span>
              {locale === optionLocale ? <Check size={17} aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )

  function languageLabel(optionLocale: Locale): string {
    return optionLocale === 'zh-CN' ? t('language.simplifiedChinese') : t('language.english')
  }

  function chooseLocale(nextLocale: Locale): void {
    selectLocale(nextLocale)
    closeMenu()
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu()
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      chooseLocale(supportedLocales[index])
      return
    }

    const nextIndex = resolveNextOptionIndex(event.key, index)
    if (nextIndex === null) {
      return
    }

    event.preventDefault()
    optionRefs.current.get(supportedLocales[nextIndex])?.focus()
  }
}

function resolveNextOptionIndex(key: string, currentIndex: number): number | null {
  if (key === 'ArrowDown' || key === 'ArrowRight') {
    return (currentIndex + 1) % supportedLocales.length
  }
  if (key === 'ArrowUp' || key === 'ArrowLeft') {
    return (currentIndex - 1 + supportedLocales.length) % supportedLocales.length
  }
  if (key === 'Home') {
    return 0
  }
  if (key === 'End') {
    return supportedLocales.length - 1
  }

  return null
}
