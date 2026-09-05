import {
  applyInitialLocalePreference,
  localePreferenceStorageKey,
  readLocalePreference,
  resolveInitialLocale
} from '../../../../src/presentation/i18n/localePreference'
import { supportedLocales } from '../../../../src/presentation/i18n/locale'

describe('locale preference', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.lang = ''
    delete document.documentElement.dataset.locale
  })

  it('accepts only the supported persisted locales', () => {
    expect(readLocalePreference(window.localStorage)).toBeNull()

    window.localStorage.setItem(localePreferenceStorageKey, 'fr')
    expect(readLocalePreference(window.localStorage)).toBeNull()

    for (const locale of supportedLocales) {
      window.localStorage.setItem(localePreferenceStorageKey, locale)
      expect(readLocalePreference(window.localStorage)).toBe(locale)
    }
  })

  it('uses simplified Chinese for Chinese systems and English for other systems', () => {
    expect(resolveInitialLocale(null, ['zh-TW', 'en-US'])).toBe('zh-CN')
    expect(resolveInitialLocale(null, ['en-GB', 'zh-CN'])).toBe('en')
    expect(resolveInitialLocale(null, [])).toBe('en')
  })

  it('lets an explicit preference override the current system language', () => {
    expect(resolveInitialLocale('en', ['zh-CN'])).toBe('en')
    expect(resolveInitialLocale('zh-CN', ['en-US'])).toBe('zh-CN')
  })

  it('restores the locale before render and synchronizes the document language', () => {
    window.localStorage.setItem(localePreferenceStorageKey, 'zh-CN')

    expect(
      applyInitialLocalePreference({
        root: document.documentElement,
        storage: window.localStorage,
        systemLanguages: ['en-US']
      })
    ).toBe('zh-CN')
    expect(document.documentElement).toHaveAttribute('lang', 'zh-CN')
    expect(document.documentElement).toHaveAttribute('data-locale', 'zh-CN')
  })
})
