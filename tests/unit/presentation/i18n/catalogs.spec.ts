import { localeDefinitions, supportedLocales } from '../../../../src/presentation/i18n/locale'
import {
  localeCatalogs,
  translate,
  type MessageKey
} from '../../../../src/presentation/i18n/messages'

describe('locale catalogs', () => {
  it('registers a catalog for every supported locale without extra locales', () => {
    expect(Object.keys(localeCatalogs).sort()).toEqual([...supportedLocales].sort())
  })

  it.each(supportedLocales)('keeps %s complete with matching interpolation variables', (locale) => {
    const source = localeCatalogs['zh-CN']
    const catalog = localeCatalogs[locale]
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(source).sort())

    for (const key of Object.keys(source) as MessageKey[]) {
      expect(catalog[key].trim(), `${locale}: ${key}`).not.toBe('')
      expect(variablesIn(catalog[key]), `${locale}: ${key}`).toEqual(variablesIn(source[key]))
    }

    expect(catalog[localeDefinitions[locale].labelKey].trim()).not.toBe('')
  })

  it.each(supportedLocales)('preserves runtime values when interpolating in %s', (locale) => {
    const name = '项目 / Café 🚀'
    const version = '1.2.3-beta'
    const result = translate(locale, 'settings.diagnostics.summaryApplication', { name, version })

    expect(result).toContain(name)
    expect(result).toContain(version)
    expect(result).not.toContain('{name}')
    expect(result).not.toContain('{version}')
  })
})

function variablesIn(message: string): string[] {
  return [...new Set([...message.matchAll(/\{([^{}]+)\}/gu)].map((match) => match[1]))].sort()
}
