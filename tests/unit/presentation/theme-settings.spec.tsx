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
    fireEvent.click(trigger)

    expect(screen.getByRole('dialog', { name: '主题设置' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '关闭主题设置' })).toHaveFocus()
    expect(screen.getByRole('radio', { name: '系统' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '浅色' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: '深色' })).not.toBeChecked()
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

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: '主题设置' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
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
