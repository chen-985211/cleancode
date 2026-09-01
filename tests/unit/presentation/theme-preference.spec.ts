import {
  applyInitialThemePreference,
  readThemePreference,
  resolveEffectiveTheme,
  themePreferenceStorageKey
} from '../../../src/presentation/app-shell/app-features/settings/themePreference'

describe('theme preference', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.colorScheme = ''
  })

  it('defaults invalid or missing persisted values to the system preference', () => {
    expect(readThemePreference(window.localStorage)).toBe('system')

    window.localStorage.setItem(themePreferenceStorageKey, 'midnight')

    expect(readThemePreference(window.localStorage)).toBe('system')
  })

  it('restores every supported persisted preference', () => {
    for (const preference of ['system', 'light', 'dark'] as const) {
      window.localStorage.setItem(themePreferenceStorageKey, preference)

      expect(readThemePreference(window.localStorage)).toBe(preference)
    }
  })

  it('only lets the system color scheme decide the effective system theme', () => {
    expect(resolveEffectiveTheme('system', false)).toBe('light')
    expect(resolveEffectiveTheme('system', true)).toBe('dark')
    expect(resolveEffectiveTheme('light', true)).toBe('light')
    expect(resolveEffectiveTheme('dark', false)).toBe('dark')
  })

  it('applies the restored effective theme before the application renders', () => {
    window.localStorage.setItem(themePreferenceStorageKey, 'dark')

    expect(
      applyInitialThemePreference({
        root: document.documentElement,
        storage: window.localStorage,
        systemPrefersDark: false
      })
    ).toEqual({ effectiveTheme: 'dark', preference: 'dark' })
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })
})
