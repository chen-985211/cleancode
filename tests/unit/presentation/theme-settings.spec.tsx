import { fireEvent, render, screen } from '@testing-library/react'

import { ThemeSettingsRoot } from '../../../src/presentation/app-shell/ThemeSettingsRoot'
import { themePreferenceStorageKey } from '../../../src/presentation/app-shell/themePreference'

interface MutableMediaQueryList extends MediaQueryList {
  matches: boolean
}

describe('theme settings', () => {
  let mediaQuery: MutableMediaQueryList
  let systemThemeListeners: Array<(event: MediaQueryListEvent) => void>

  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    systemThemeListeners = []
    mediaQuery = {
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: vi.fn((_type, listener) => {
        systemThemeListeners.push(listener as (event: MediaQueryListEvent) => void)
      }),
      removeEventListener: vi.fn((_type, listener) => {
        systemThemeListeners = systemThemeListeners.filter((entry) => entry !== listener)
      }),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mediaQuery)
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens a focused right-side dialog with only the first-phase theme choices', () => {
    render(<ThemeSettingsRoot />)

    const trigger = screen.getByRole('button', { name: '主题设置' })
    expect(trigger).toHaveClass('app-shell-utility-button')
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' })
    fireEvent.pointerUp(trigger, { button: 0, pointerType: 'mouse' })
    expect(trigger).toHaveAttribute('data-toolbar-utility-motion-state', 'opening')
    fireEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveAttribute('data-toolbar-utility-motion-state', 'open')
    const dialog = screen.getByRole('dialog', { name: '主题设置' })
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('data-surface-spring-preset', 'drawer-right')
    expect(screen.getByRole('button', { name: '关闭主题设置' })).toHaveFocus()
    expect(screen.getByRole('radio', { name: '系统' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '浅色' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: '深色' })).not.toBeChecked()
    expect(previewFor(screen.getByRole('radio', { name: '系统' }))).toHaveAttribute(
      'data-selection-motion-state',
      'open'
    )
    expect(previewFor(screen.getByRole('radio', { name: '深色' }))).toHaveAttribute(
      'data-selection-motion-state',
      'closed'
    )
    expect(screen.queryByText('颜色预设')).not.toBeInTheDocument()
    expect(screen.queryByText('字体')).not.toBeInTheDocument()
    expect(screen.queryByText('圆角')).not.toBeInTheDocument()
    expect(screen.queryByText('密度')).not.toBeInTheDocument()
  })

  it('persists an explicit preference and restores focus when Escape closes the dialog', () => {
    render(<ThemeSettingsRoot />)
    const trigger = screen.getByRole('button', { name: '主题设置' })

    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('radio', { name: '深色' }))

    expect(window.localStorage.getItem(themePreferenceStorageKey)).toBe('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(screen.getByRole('radio', { name: '深色' })).toBeChecked()
    expect(previewFor(screen.getByRole('radio', { name: '系统' }))).toHaveAttribute(
      'data-selection-motion-state',
      'closing'
    )
    expect(previewFor(screen.getByRole('radio', { name: '深色' }))).toHaveAttribute(
      'data-selection-motion-state',
      'opening'
    )

    const dialog = screen.getByRole('dialog', { name: '主题设置' })
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: '主题设置' })).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.transitionEnd(dialog, { propertyName: 'opacity' })
    expect(trigger).toHaveFocus()
  })

  it('does not steal focus back when a new external intent takes over an active exit', () => {
    render(
      <>
        <button type="button">外部目标</button>
        <ThemeSettingsRoot />
      </>
    )
    const trigger = screen.getByRole('button', { name: '主题设置' })
    const externalTarget = screen.getByRole('button', { name: '外部目标' })
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: '主题设置' })

    fireEvent.click(screen.getByRole('button', { name: '关闭主题设置' }))
    fireEvent.pointerDown(externalTarget)
    externalTarget.focus()
    fireEvent.transitionEnd(dialog, { propertyName: 'opacity' })

    expect(externalTarget).toHaveFocus()
    expect(trigger).not.toHaveFocus()
  })

  it('isolates the workbench while open and restores interaction after closing', () => {
    render(
      <>
        <aside className="project-sidebar" aria-label="项目与分支工作区" />
        <section className="app-shell__workspace" aria-label="积木画布" />
        <ThemeSettingsRoot />
      </>
    )

    const sidebar = screen.getByLabelText('项目与分支工作区')
    const workspace = screen.getByLabelText('积木画布')
    const trigger = screen.getByRole('button', { name: '主题设置' })

    fireEvent.click(trigger)

    expect(sidebar.inert).toBe(true)
    expect(workspace.inert).toBe(true)
    expect(screen.getByRole('button', { name: '关闭主题设置' })).toHaveFocus()

    const dialog = screen.getByRole('dialog', { name: '主题设置' })
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(sidebar.inert).toBe(false)
    expect(workspace.inert).toBe(false)
    fireEvent.transitionEnd(dialog, { propertyName: 'opacity' })
    expect(sidebar.inert).toBe(false)
    expect(workspace.inert).toBe(false)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('retains an inert closing drawer until the shared overlay exit completes', () => {
    render(<ThemeSettingsRoot />)

    fireEvent.click(screen.getByRole('button', { name: '主题设置' }))
    const dialog = screen.getByRole('dialog', { name: '主题设置' })

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: '主题设置' })).not.toBeInTheDocument()
    expect(dialog).toHaveAttribute('data-surface-motion-state', 'closing')
    expect(dialog).toHaveAttribute('aria-hidden', 'true')
    expect(dialog).toHaveAttribute('inert')

    fireEvent.transitionEnd(dialog, { propertyName: 'transform' })

    expect(dialog).not.toBeInTheDocument()
  })

  it('keeps keyboard focus inside the theme dialog', () => {
    render(<ThemeSettingsRoot />)

    fireEvent.click(screen.getByRole('button', { name: '主题设置' }))

    const dialog = screen.getByRole('dialog', { name: '主题设置' })
    const closeButton = screen.getByRole('button', { name: '关闭主题设置' })
    const selectedOption = screen.getByRole('radio', { name: '系统' })

    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(selectedOption).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(closeButton).toHaveFocus()
  })

  it('reacts to system changes only while the system preference is selected', () => {
    render(<ThemeSettingsRoot />)

    expect(document.documentElement).toHaveAttribute('data-theme', 'light')

    mediaQuery.matches = true
    for (const listener of systemThemeListeners) {
      listener({ matches: true } as MediaQueryListEvent)
    }

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')

    fireEvent.click(screen.getByRole('button', { name: '主题设置' }))
    fireEvent.click(screen.getByRole('radio', { name: '浅色' }))
    mediaQuery.matches = false
    for (const listener of systemThemeListeners) {
      listener({ matches: false } as MediaQueryListEvent)
    }

    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })
})

function previewFor(input: HTMLElement): Element | null {
  return input.nextElementSibling
}
