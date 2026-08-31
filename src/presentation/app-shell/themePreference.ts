export type ThemePreference = 'system' | 'light' | 'dark'
export type EffectiveTheme = 'light' | 'dark'

export const themePreferenceStorageKey = 'cleancode:theme-preference'
const effectiveThemeChangeEventName = 'cleancode-effective-theme-change'
export const systemDarkThemeQuery = '(prefers-color-scheme: dark)'

interface InitialThemePreferenceInput {
  readonly root: HTMLElement
  readonly storage: Pick<Storage, 'getItem'>
  readonly systemPrefersDark: boolean
}

export function readThemePreference(
  storage: Pick<Storage, 'getItem'> = window.localStorage
): ThemePreference {
  const value = storage.getItem(themePreferenceStorageKey)

  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

export function resolveEffectiveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean
): EffectiveTheme {
  if (preference === 'system') {
    return systemPrefersDark ? 'dark' : 'light'
  }

  return preference
}

export function applyEffectiveTheme(
  effectiveTheme: EffectiveTheme,
  root: HTMLElement = document.documentElement
): void {
  const didThemeChange = root.dataset.theme !== effectiveTheme

  root.dataset.theme = effectiveTheme
  root.style.colorScheme = effectiveTheme

  if (didThemeChange) {
    window.dispatchEvent(
      new CustomEvent(effectiveThemeChangeEventName, { detail: { effectiveTheme } })
    )
  }
}

export function applyInitialThemePreference(
  {
    root,
    storage,
    systemPrefersDark
  }: InitialThemePreferenceInput = createBrowserInitialThemeInput()
): {
  readonly preference: ThemePreference
  readonly effectiveTheme: EffectiveTheme
} {
  const preference = readThemePreference(storage)
  const effectiveTheme = resolveEffectiveTheme(preference, systemPrefersDark)

  applyEffectiveTheme(effectiveTheme, root)

  return { preference, effectiveTheme }
}

function createBrowserInitialThemeInput(): InitialThemePreferenceInput {
  return {
    root: document.documentElement,
    storage: window.localStorage,
    systemPrefersDark: window.matchMedia?.(systemDarkThemeQuery).matches ?? false
  }
}
