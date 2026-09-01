import { fireEvent, render, screen } from '@testing-library/react'

import { I18nProvider } from '../../../src/presentation/i18n/I18nProvider'
import { localePreferenceStorageKey } from '../../../src/presentation/i18n/localePreference'
import { LanguageSettingsRoot } from '../../../src/presentation/app-shell/app-features/settings/LanguageSettingsRoot'
import { ThemeSettingsRoot } from '../../../src/presentation/app-shell/app-features/settings/ThemeSettingsRoot'
import { WorkbenchToolbar } from '../../../src/presentation/app-shell/workbench/toolbar/WorkbenchToolbar'

describe('language settings', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.lang = ''
    delete document.documentElement.dataset.locale
  })

  it('opens a compact single-choice menu with the current locale selected', () => {
    renderLanguageSettings('zh-CN')

    const trigger = screen.getByRole('button', { name: '语言' })
    expect(trigger).toHaveClass('toolbar-utility-button')
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu', { name: '语言' })
    expect(menu).toBeInTheDocument()
    expect(menu).toHaveAttribute('data-surface-spring-preset', 'anchored-top-right')
    expect(screen.getByRole('menuitemradio', { name: '简体中文' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(screen.getByRole('menuitemradio', { name: 'English' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
    expect(screen.getByRole('menuitemradio', { name: '简体中文' })).toHaveFocus()
  })

  it('switches immediately, persists the choice, closes, and returns focus', () => {
    renderLanguageSettings('zh-CN')

    fireEvent.click(screen.getByRole('button', { name: '语言' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'English' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(localePreferenceStorageKey)).toBe('en')
    expect(document.documentElement).toHaveAttribute('lang', 'en')
    expect(document.documentElement).toHaveAttribute('data-locale', 'en')
    expect(screen.getByRole('button', { name: 'Language' })).toHaveFocus()
  })

  it('supports arrow-key selection and Escape focus restoration', () => {
    renderLanguageSettings('zh-CN')

    const trigger = screen.getByRole('button', { name: '语言' })
    fireEvent.click(trigger)

    const chineseOption = screen.getByRole('menuitemradio', { name: '简体中文' })
    fireEvent.keyDown(chineseOption, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitemradio', { name: 'English' })).toHaveFocus()

    fireEvent.keyDown(screen.getByRole('menuitemradio', { name: 'English' }), { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes when pointer interaction moves outside the menu', () => {
    const canvasPointerDown = vi.fn()
    render(
      <div onPointerDown={canvasPointerDown}>
        <I18nProvider initialLocale="zh-CN">
          <LanguageSettingsRoot />
        </I18nProvider>
      </div>
    )

    const trigger = screen.getByRole('button', { name: '语言' })
    fireEvent.click(trigger)
    const dismissalLayer = document.querySelector('.language-settings-dismiss-layer')
    expect(dismissalLayer).toBeInTheDocument()
    fireEvent.pointerDown(dismissalLayer as Element)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(canvasPointerDown).not.toHaveBeenCalled()
  })

  it('keeps a closing menu inert until its exit finishes and reverses from the live surface', () => {
    renderLanguageSettings('zh-CN')

    const trigger = screen.getByRole('button', { name: '语言' })
    fireEvent.click(trigger)
    const liveMenu = screen.getByRole('menu', { name: '语言' })

    fireEvent.pointerDown(document.querySelector('.language-settings-dismiss-layer') as Element)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(liveMenu).toHaveAttribute('data-surface-motion-state', 'closing')
    expect(liveMenu).toHaveAttribute('aria-hidden', 'true')
    expect(liveMenu).toHaveAttribute('inert')

    fireEvent.click(trigger)

    expect(screen.getByRole('menu', { name: '语言' })).toBe(liveMenu)
    expect(liveMenu).not.toHaveAttribute('aria-hidden')
    expect(liveMenu).not.toHaveAttribute('inert')
  })

  it('updates neighboring application settings copy in English', () => {
    render(
      <I18nProvider initialLocale="en">
        <ThemeSettingsRoot />
      </I18nProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Theme settings' }))

    expect(screen.getByRole('dialog', { name: 'Theme settings' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Light' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked()
  })

  it('renders representative workbench actions in English', () => {
    render(
      <I18nProvider initialLocale="en">
        <WorkbenchToolbar
          isDesktopRuntime
          hasWorkbench
          isTerminalGroupSelectionMode={false}
          selectedTerminalGroupCandidateCount={0}
          canCreateTerminalGroup={false}
          shortcutTooltips={{
            createAgent: 'New Agent (Ctrl+Shift+A)'
          }}
          onCreateWorkspaceAgent={vi.fn()}
          onCreateTerminalGroup={vi.fn()}
          onCancelTerminalGroupSelection={vi.fn()}
        />
      </I18nProvider>
    )

    const toolbar = screen.getByRole('toolbar', { name: 'Workbench toolbar' })
    expect(toolbar).toHaveTextContent('New Agent')
    expect(toolbar).not.toHaveTextContent('New terminal block')
    expect(toolbar).not.toHaveTextContent('Group terminals')
  })
})

function renderLanguageSettings(initialLocale: 'zh-CN' | 'en'): void {
  render(
    <I18nProvider initialLocale={initialLocale}>
      <LanguageSettingsRoot />
    </I18nProvider>
  )
}
