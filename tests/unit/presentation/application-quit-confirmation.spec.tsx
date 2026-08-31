import { act, render, waitFor } from '@testing-library/react'

import { ApplicationQuitConfirmationBridge } from '../../../src/presentation/app-shell/ApplicationQuitConfirmationBridge'
import { I18nProvider } from '../../../src/presentation/i18n/I18nProvider'
import type { ApplicationQuitRequest } from '../../../src/platform/ipc/applicationQuitChannels'

describe('application quit confirmation bridge', () => {
  const originalRuntime = window.cleancode
  let publishRequest: ((request: ApplicationQuitRequest) => void) | undefined
  let showApplicationQuitConfirmation: ReturnType<typeof vi.fn>
  let unsubscribe: ReturnType<typeof vi.fn>

  beforeEach(() => {
    showApplicationQuitConfirmation = vi.fn().mockResolvedValue(true)
    unsubscribe = vi.fn()
    publishRequest = undefined
    window.cleancode = {
      appName: 'cleancode',
      showApplicationQuitConfirmation,
      onApplicationQuitRequested: (listener: (request: ApplicationQuitRequest) => void) => {
        publishRequest = listener
        return unsubscribe
      }
    } as unknown as Window['cleancode']
  })

  afterEach(() => {
    window.cleancode = originalRuntime
  })

  it('forwards only localized title and actions to the native dialog', async () => {
    const { unmount } = render(
      <I18nProvider initialLocale="zh-CN">
        <ApplicationQuitConfirmationBridge />
      </I18nProvider>
    )

    act(() => publishRequest?.({ requestId: 'quit-request-1' }))

    await waitFor(() =>
      expect(showApplicationQuitConfirmation).toHaveBeenCalledWith({
        cancelLabel: '取消',
        confirmLabel: '退出',
        message: '退出 cleancode？',
        requestId: 'quit-request-1'
      })
    )
    expect(document.body).toHaveTextContent('')
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()

    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('uses the active English catalog without rendering a custom surface', async () => {
    render(
      <I18nProvider initialLocale="en">
        <ApplicationQuitConfirmationBridge />
      </I18nProvider>
    )

    act(() => publishRequest?.({ requestId: 'quit-request-1' }))

    await waitFor(() =>
      expect(showApplicationQuitConfirmation).toHaveBeenCalledWith({
        cancelLabel: 'Cancel',
        confirmLabel: 'Quit',
        message: 'Quit cleancode?',
        requestId: 'quit-request-1'
      })
    )
    expect(document.body).toHaveTextContent('')
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
  })

  it('ignores malformed renderer events', () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <ApplicationQuitConfirmationBridge />
      </I18nProvider>
    )

    act(() => publishRequest?.({ requestId: '' }))

    expect(showApplicationQuitConfirmation).not.toHaveBeenCalled()
  })
})
