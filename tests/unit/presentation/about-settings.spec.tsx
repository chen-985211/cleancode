import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { AboutSettingsPane } from '../../../src/presentation/app-shell/app-features/settings/AboutSettingsPane'
import { I18nProvider } from '../../../src/presentation/i18n/I18nProvider'
import { motionPreferenceStore } from '../../../src/presentation/shared/motion/motionPreference'

describe('about repository stars', () => {
  const originalRuntime = window.cleancode

  beforeEach(() => {
    vi.spyOn(motionPreferenceStore, 'getSnapshot').mockReturnValue(true)
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Object.defineProperty(window, 'cleancode', { configurable: true, value: originalRuntime })
  })

  it.each([0, 3200])(
    'shows the real count %s and links to the application repository',
    async (count) => {
      installQuery(vi.fn().mockResolvedValue(count))
      render(<AboutSettingsPane />)

      const link = await screen.findByRole('link', {
        name: `在 GitHub 上为 CleanCode 点 Star（${count} Stars）`
      })
      expect(link).toHaveAttribute('href', 'https://github.com/chen-985211/cleancode')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noreferrer')
      expect(link).toHaveAttribute('aria-busy', 'false')
      expect(link).toHaveTextContent(String(count))
    }
  )

  it('keeps navigation available while loading and after a failed query', async () => {
    let rejectQuery: (reason: unknown) => void = () => undefined
    installQuery(
      () =>
        new Promise<number>((_resolve, reject) => {
          rejectQuery = reject
        })
    )
    render(<AboutSettingsPane />)

    const link = screen.getByRole('link', { name: '在 GitHub 上为 CleanCode 点 Star' })
    expect(link).toHaveAttribute('aria-busy', 'true')
    expect(link).toHaveTextContent('Star on GitHub')
    await act(async () => rejectQuery(new Error('offline')))
    expect(link).toHaveAttribute('aria-busy', 'false')
    expect(link).toHaveTextContent('Star on GitHub')
    expect(link).not.toHaveTextContent('0')
  })

  it('provides a localized external link without a desktop bridge', () => {
    Object.defineProperty(window, 'cleancode', { configurable: true, value: undefined })
    render(
      <I18nProvider initialLocale="en">
        <AboutSettingsPane />
      </I18nProvider>
    )

    const link = screen.getByRole('link', { name: 'Star CleanCode on GitHub' })
    expect(link).toHaveTextContent('Star on GitHub')
    expect(link).toHaveAttribute('aria-busy', 'false')
  })

  it('ignores a late result from an unmounted pane', async () => {
    let resolveQuery: (count: number) => void = () => undefined
    const query = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          resolveQuery = resolve
        })
    )
    installQuery(query)
    const first = render(<AboutSettingsPane />)
    first.unmount()
    installQuery(vi.fn().mockRejectedValue(new Error('offline')))
    render(<AboutSettingsPane />)

    await act(async () => resolveQuery(999))
    expect(screen.getByRole('link')).toHaveTextContent('Star on GitHub')
    expect(screen.getByRole('link')).not.toHaveTextContent('999')
  })

  it('uses the upstream rolling digits while preserving the accessible final count when motion is reduced', async () => {
    const preference = vi.mocked(motionPreferenceStore.getSnapshot).mockReturnValue(false)
    installQuery(vi.fn().mockResolvedValue(3200))
    const view = render(<AboutSettingsPane />)
    const link = await screen.findByRole('link', {
      name: '在 GitHub 上为 CleanCode 点 Star（3200 Stars）'
    })
    expect(link.querySelectorAll('[data-slot="sliding-number-roller"]')).toHaveLength(4)

    preference.mockReturnValue(true)
    view.rerender(<AboutSettingsPane />)
    expect(link).toHaveAccessibleName('在 GitHub 上为 CleanCode 点 Star（3200 Stars）')
    view.unmount()
  })

  it.each([
    { locale: 'zh-CN', count: 113, label: '在 GitHub 上为 CleanCode 点 Star（113 Stars）' },
    { locale: 'en', count: null, label: 'Star CleanCode on GitHub' }
  ] as const)(
    'uses the shared tooltip in $locale without a native title',
    async ({ locale, count, label }) => {
      if (count === null)
        Object.defineProperty(window, 'cleancode', { configurable: true, value: undefined })
      else installQuery(vi.fn().mockResolvedValue(count))
      render(
        <I18nProvider initialLocale={locale}>
          <AboutSettingsPane />
        </I18nProvider>
      )

      const link = await screen.findByRole('link', { name: label })
      expect(link).not.toHaveAttribute('title')
      fireEvent.keyDown(document, { key: 'Tab' })
      act(() => link.focus())
      expect(await screen.findByRole('tooltip')).toHaveTextContent(label)
      expect(link).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id)

      fireEvent.keyDown(link, { key: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
      expect(link).toHaveFocus()
    }
  )
})

function installQuery(query: () => Promise<number>): void {
  Object.defineProperty(window, 'cleancode', {
    configurable: true,
    value: { getApplicationRepositoryStars: query }
  })
}
