import { ArrowLeft, Keyboard, RotateCcw, Settings, X } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'

import {
  applicationShortcutBindingsEqual,
  applicationShortcutCommands,
  defaultApplicationShortcutBindings,
  findShortcutConflict,
  formatShortcutBinding,
  normalizeShortcutBinding,
  type ApplicationShortcutBinding,
  type ApplicationShortcutBindings,
  type ApplicationShortcutCommand,
  type ShortcutPlatform
} from './applicationShortcuts'
import {
  applicationShortcutCommandMessageKeys,
  createApplicationShortcutTooltipLabels
} from './applicationShortcutTooltips'
import { useI18n } from './i18n/useI18n'
import { TooltipLabel } from './Tooltip'

interface ApplicationSettingsRootProps {
  readonly bindings: ApplicationShortcutBindings
  readonly isOpen: boolean
  readonly platform: ShortcutPlatform
  readonly onBindingChange: (
    command: ApplicationShortcutCommand,
    binding: ApplicationShortcutBinding | null
  ) => void
  readonly onClose: () => void
  readonly onOpen: () => void
  readonly onResetAll: () => void
}

export function ApplicationSettingsRoot(props: ApplicationSettingsRootProps) {
  const { t } = useI18n()
  const shortcutTooltips = createApplicationShortcutTooltipLabels(props.bindings, props.platform, t)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const backButtonRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(props.onClose)
  const [recordingCommand, setRecordingCommand] = useState<ApplicationShortcutCommand | null>(null)
  const [captureError, setCaptureError] = useState<
    { readonly command: ApplicationShortcutCommand; readonly message: string } | undefined
  >()

  const closeSettings = useCallback((): void => {
    setRecordingCommand(null)
    setCaptureError(undefined)
    onCloseRef.current()
    triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    onCloseRef.current = props.onClose
  }, [props.onClose])

  useEffect(() => {
    if (!props.isOpen) {
      return undefined
    }

    backButtonRef.current?.focus()
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
  }, [closeSettings, props.isOpen])

  return (
    <>
      <TooltipLabel content={shortcutTooltips.openSettings} side="bottom">
        <button
          ref={triggerRef}
          className="application-settings-trigger"
          type="button"
          aria-controls="application-settings-dialog"
          aria-expanded={props.isOpen}
          aria-haspopup="dialog"
          aria-label={t('settings.open')}
          onClick={props.onOpen}
        >
          <Settings size={17} aria-hidden="true" />
        </button>
      </TooltipLabel>
      {props.isOpen ? (
        <section
          id="application-settings-dialog"
          ref={dialogRef}
          className={`application-settings-surface application-settings-surface--${props.platform}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="application-settings-title"
          onKeyDown={(event) => trapSettingsFocus(event, dialogRef.current)}
        >
          <header className="application-settings-header">
            <TooltipLabel content={t('settings.back')} side="right">
              <button
                ref={backButtonRef}
                className="application-settings-back"
                type="button"
                aria-label={t('settings.back')}
                onClick={closeSettings}
              >
                <ArrowLeft size={18} aria-hidden="true" />
              </button>
            </TooltipLabel>
            <h1 id="application-settings-title">{t('settings.title')}</h1>
          </header>
          <div className="application-settings-layout">
            <nav className="application-settings-navigation" aria-label={t('settings.navigation')}>
              <button type="button" aria-current="page">
                <Keyboard size={17} aria-hidden="true" />
                <span>{t('settings.shortcuts.title')}</span>
              </button>
            </nav>
            <main className="application-settings-content">
              <div className="shortcut-settings-pane">
                <header className="shortcut-settings-pane__header">
                  <div>
                    <h2>{t('settings.shortcuts.title')}</h2>
                    <p>{t('settings.shortcuts.description')}</p>
                  </div>
                  <button
                    className="shortcut-settings-reset-all"
                    type="button"
                    onClick={() => {
                      setRecordingCommand(null)
                      setCaptureError(undefined)
                      props.onResetAll()
                    }}
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    {t('settings.shortcuts.resetAll')}
                  </button>
                </header>
                <div className="shortcut-settings-list">
                  {applicationShortcutCommands.map((command) => {
                    const action = t(applicationShortcutCommandMessageKeys[command])
                    const binding = props.bindings[command]
                    const isRecording = recordingCommand === command
                    const error =
                      captureError?.command === command ? captureError.message : undefined
                    const errorId = `application-shortcut-${command}-error`
                    return (
                      <div className="shortcut-settings-row" key={command}>
                        <div className="shortcut-settings-row__label">{action}</div>
                        <div className="shortcut-settings-row__controls">
                          <button
                            className="shortcut-recorder"
                            type="button"
                            aria-describedby={error ? errorId : undefined}
                            aria-label={t('settings.shortcuts.edit', { action })}
                            aria-pressed={isRecording}
                            onClick={() => {
                              setRecordingCommand(command)
                              setCaptureError(undefined)
                            }}
                            onKeyDown={(event) => captureShortcut(event, command)}
                          >
                            {isRecording ? (
                              <span className="shortcut-recorder__prompt">
                                {t('settings.shortcuts.recording')}
                              </span>
                            ) : binding === null ? (
                              <span className="shortcut-recorder__empty">
                                {t('settings.shortcuts.unassigned')}
                              </span>
                            ) : (
                              formatShortcutBinding(binding, props.platform).map((label) => (
                                <kbd key={label}>{label}</kbd>
                              ))
                            )}
                          </button>
                          <TooltipLabel content={t('settings.shortcuts.clear', { action })}>
                            <button
                              className="shortcut-row-action"
                              type="button"
                              aria-label={t('settings.shortcuts.clear', { action })}
                              disabled={binding === null}
                              onClick={() => {
                                props.onBindingChange(command, null)
                                setRecordingCommand(null)
                                setCaptureError(undefined)
                              }}
                            >
                              <X size={15} aria-hidden="true" />
                            </button>
                          </TooltipLabel>
                          <TooltipLabel content={t('settings.shortcuts.reset', { action })}>
                            <button
                              className="shortcut-row-action"
                              type="button"
                              aria-label={t('settings.shortcuts.reset', { action })}
                              disabled={applicationShortcutBindingsEqual(
                                binding,
                                defaultApplicationShortcutBindings[command]
                              )}
                              onClick={() => {
                                props.onBindingChange(
                                  command,
                                  defaultApplicationShortcutBindings[command]
                                )
                                setRecordingCommand(null)
                                setCaptureError(undefined)
                              }}
                            >
                              <RotateCcw size={15} aria-hidden="true" />
                            </button>
                          </TooltipLabel>
                        </div>
                        {error ? (
                          <p id={errorId} className="shortcut-settings-row__error" role="alert">
                            {error}
                          </p>
                        ) : isRecording ? (
                          <p className="shortcut-settings-row__hint">
                            {t('settings.shortcuts.captureHint')}
                          </p>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            </main>
          </div>
        </section>
      ) : null}
    </>
  )

  function captureShortcut(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    command: ApplicationShortcutCommand
  ): void {
    if (recordingCommand !== command) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') {
      setRecordingCommand(null)
      setCaptureError(undefined)
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      props.onBindingChange(command, null)
      setRecordingCommand(null)
      setCaptureError(undefined)
      return
    }

    const binding = normalizeShortcutBinding(event.nativeEvent, props.platform)
    if (binding === null) {
      setCaptureError({ command, message: t('settings.shortcuts.invalid') })
      return
    }

    const conflict = findShortcutConflict(props.bindings, command, binding)
    if (conflict !== null) {
      setCaptureError({
        command,
        message: t('settings.shortcuts.conflict', {
          action: t(applicationShortcutCommandMessageKeys[conflict])
        })
      })
      return
    }

    props.onBindingChange(command, binding)
    setRecordingCommand(null)
    setCaptureError(undefined)
  }
}

function trapSettingsFocus(
  event: ReactKeyboardEvent<HTMLElement>,
  dialog: HTMLElement | null
): void {
  if (event.key !== 'Tab' || dialog === null) {
    return
  }

  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled)')
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
