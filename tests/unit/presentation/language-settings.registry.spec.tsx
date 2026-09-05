import { fireEvent, render, screen } from '@testing-library/react'

import { LanguageSettingsRoot } from '../../../src/presentation/app-shell/app-features/settings/LanguageSettingsRoot'
import type * as LocaleModule from '../../../src/presentation/i18n/locale'
import { resolveInitialLocale } from '../../../src/presentation/i18n/localePreference'

const selectLocale = vi.hoisted(() => vi.fn())

vi.mock('../../../src/presentation/i18n/locale', async (importOriginal) => {
  const actual = await importOriginal<typeof LocaleModule>()
  return {
    ...actual,
    supportedLocales: ['zh-CN', 'en', 'ja'],
    localeDefinitions: {
      'zh-CN': { labelKey: 'language.simplifiedChinese', systemLanguagePrefix: 'zh' },
      en: { labelKey: 'language.english', systemLanguagePrefix: 'en' },
      ja: { labelKey: 'language.japanese', systemLanguagePrefix: 'ja' }
    }
  }
})

vi.mock('../../../src/presentation/i18n/useI18n', () => ({
  useI18n: () => ({
    locale: 'en',
    selectLocale,
    t: (key: string) => {
      const labels: Record<string, string> = {
        'language.settings': 'Language',
        'language.simplifiedChinese': '简体中文',
        'language.english': 'English',
        'language.japanese': '日本語'
      }
      return labels[key]
    }
  })
}))

describe('registered language settings', () => {
  it('matches the preferred system language using the additional locale registration', () => {
    expect(resolveInitialLocale(null, ['JA-jp', 'en-US'])).toBe('ja')
    expect(resolveInitialLocale(null, ['fr-FR', 'ja-JP'])).toBe('en')
    expect(resolveInitialLocale('zh-CN', ['ja-JP'])).toBe('zh-CN')
  })

  it('labels and selects an additional registered language through the same menu', () => {
    render(<LanguageSettingsRoot />)

    const trigger = screen.getByRole('button', { name: 'Language' })
    fireEvent.click(trigger)
    const japanese = screen.getByRole('menuitemradio', { name: '日本語' })
    expect(japanese).toHaveAttribute('aria-checked', 'false')

    fireEvent.keyDown(screen.getByRole('menuitemradio', { name: 'English' }), { key: 'End' })
    expect(japanese).toHaveFocus()
    fireEvent.keyDown(japanese, { key: 'Enter' })

    expect(selectLocale).toHaveBeenCalledExactlyOnceWith('ja')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
