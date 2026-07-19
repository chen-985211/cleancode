import { Check, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'

import type { ThemePreference } from './themePreference'
import { useI18n } from './i18n/useI18n'
import { useThemePreference } from './useThemePreference'

const themePreferences: readonly ThemePreference[] = ['system', 'light', 'dark']

export function ThemeSettingsRoot() {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLElement | null>(null)
  const { preference, selectPreference } = useThemePreference()
  const { t } = useI18n()
  const closeSettings = (): void => {
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    closeButtonRef.current?.focus()
    const backgroundRegions = Array.from(
      document.querySelectorAll<HTMLElement>('.project-sidebar, .app-shell__workspace')
    )
    for (const region of backgroundRegions) {
      region.inert = true
    }

    const closeOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closeSettings()
      }
    }
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      for (const region of backgroundRegions) {
        region.inert = false
      }
    }
  }, [isOpen])

  return (
    <>
      <button
        ref={triggerRef}
        className="theme-settings-trigger"
        type="button"
        aria-label={t('theme.settings')}
        aria-controls="theme-settings-dialog"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title={t('theme.settings')}
        onClick={() => setIsOpen(true)}
      >
        <span className="theme-settings-trigger__palette-icon" aria-hidden="true" />
      </button>
      {isOpen ? (
        <div className="theme-settings-backdrop" onMouseDown={closeFromBackdrop}>
          <aside
            id="theme-settings-dialog"
            ref={dialogRef}
            className="theme-settings-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="theme-settings-title"
            onKeyDown={(event) => trapDialogFocus(event, dialogRef.current)}
          >
            <div className="theme-settings-drawer__header">
              <div>
                <h2 id="theme-settings-title">{t('theme.settings')}</h2>
                <p>{t('theme.description')}</p>
              </div>
              <button
                ref={closeButtonRef}
                className="theme-settings-drawer__close"
                type="button"
                aria-label={t('theme.close')}
                title={t('theme.close')}
                onClick={closeSettings}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <fieldset className="theme-settings-options">
              <legend>{t('theme.section')}</legend>
              <div className="theme-settings-options__grid">
                {themePreferences.map((option) => (
                  <label className="theme-option" key={option}>
                    <input
                      type="radio"
                      name="theme-preference"
                      value={option}
                      checked={preference === option}
                      onChange={() => selectPreference(option)}
                    />
                    <span
                      className={`theme-option__preview theme-option__preview--${option}`}
                      aria-hidden="true"
                    >
                      <span className="theme-option__preview-sidebar" />
                      <span className="theme-option__preview-content">
                        <span />
                        <span />
                        <span />
                      </span>
                      {preference === option ? (
                        <span className="theme-option__check">
                          <Check size={13} aria-hidden="true" />
                        </span>
                      ) : null}
                    </span>
                    <span className="theme-option__label">{themeLabel(option)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </aside>
        </div>
      ) : null}
    </>
  )

  function closeFromBackdrop(event: MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) {
      closeSettings()
    }
  }

  function themeLabel(option: ThemePreference): string {
    if (option === 'system') return t('theme.system')
    if (option === 'light') return t('theme.light')
    return t('theme.dark')
  }
}

function trapDialogFocus(event: KeyboardEvent<HTMLElement>, dialog: HTMLElement | null): void {
  if (event.key !== 'Tab' || !dialog) {
    return
  }

  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled):not([type="radio"]), input[type="radio"]:checked:not(:disabled)'
    )
  )
  const first = focusable[0]
  const last = focusable.at(-1)

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}
