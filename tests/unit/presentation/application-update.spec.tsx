import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ApplicationUpdateProvider } from '../../../src/presentation/app-shell/app-features/updates/ApplicationUpdateProvider'
import { ApplicationUpdateControl } from '../../../src/presentation/app-shell/app-features/updates/ApplicationUpdateControl'
import type { ApplicationUpdateSnapshot } from '../../../src/platform/ipc/applicationUpdateChannels'

function harness(initial: ApplicationUpdateSnapshot) {
  let publish: (value: ApplicationUpdateSnapshot) => void = () => undefined
  const unsubscribe = vi.fn()
  const install = vi.fn(async () => initial)
  const get = vi.fn(async () => initial)
  const check = vi.fn(async () => initial)
  window.cleancode = {
    getApplicationUpdate: get,
    checkApplicationUpdate: check,
    installApplicationUpdate: install,
    onApplicationUpdateChanged: (listener: typeof publish) => {
      publish = listener
      return unsubscribe
    }
  } as unknown as NonNullable<Window['cleancode']>
  return {
    publish: (value: ApplicationUpdateSnapshot) => act(() => publish(value)),
    install,
    check,
    get,
    unsubscribe
  }
}

describe('application update UI', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
  })
  afterEach(() => {
    delete window.cleancode
    vi.unstubAllGlobals()
  })
  it('keeps the bottom slot while hiding an unavailable update entry', async () => {
    const api = harness({ revision: 1, status: 'idle', version: null, percent: null })
    const { container } = render(
      <ApplicationUpdateProvider>
        <ApplicationUpdateControl />
      </ApplicationUpdateProvider>
    )
    await waitFor(() =>
      expect(container.querySelector('.application-update-footer')).not.toBeNull()
    )
    api.publish({
      revision: 2,
      status: 'unavailable',
      version: null,
      percent: null,
      unavailableReason: 'unsigned'
    })
    expect(container.querySelector('.application-update-footer')).not.toBeNull()
    expect(container.querySelector('[data-application-update-trigger]')).toBeNull()
  })

  it('replaces the download icon with a capsule containing only actual progress and percentage', async () => {
    const api = harness({ revision: 1, status: 'idle', version: null, percent: null })
    const view = render(
      <ApplicationUpdateProvider>
        <ApplicationUpdateControl />
      </ApplicationUpdateProvider>
    )
    const entry = await screen.findByRole('button')
    expect(entry.querySelector('svg')).not.toBeNull()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    fireEvent.click(entry)
    expect(api.check).toHaveBeenCalledOnce()
    api.publish({ revision: 2, status: 'downloading', version: '0.2.0', percent: 42.7 })
    const progress = screen.getByRole('progressbar')
    expect(progress).toHaveAttribute('aria-valuenow', '42.7')
    expect(entry.querySelector('svg')).toBeNull()
    expect(screen.getByText('42%')).toBeInTheDocument()
    expect(screen.queryByText('正在下载')).not.toBeInTheDocument()
    api.publish({ revision: 3, status: 'verifying', version: '0.2.0', percent: 100 })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    view.unmount()
    expect(api.unsubscribe).toHaveBeenCalledOnce()
  })

  it('prompts once per verified version, defers without installing, and reopens from the sidebar', async () => {
    const api = harness({ revision: 1, status: 'idle', version: null, percent: null })
    render(
      <ApplicationUpdateProvider>
        <ApplicationUpdateControl />
      </ApplicationUpdateProvider>
    )
    await waitFor(() => expect(api.get).toHaveBeenCalledOnce())
    api.publish({ revision: 2, status: 'ready', version: '0.2.0', percent: 100 })
    expect(await screen.findByRole('alertdialog', { name: '更新已就绪' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '稍后' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(api.install).not.toHaveBeenCalled()
    api.publish({ revision: 3, status: 'ready', version: '0.2.0', percent: 100 })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重启并更新' }))
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    // The dialog confirmation is distinct from the sidebar entry.
    fireEvent.click(screen.getByRole('alertdialog').querySelector('button[data-update-install]')!)
    await waitFor(() => expect(api.install).toHaveBeenCalledExactlyOnceWith({ version: '0.2.0' }))
  })

  it('keeps the newer live snapshot when the initial query arrives late', async () => {
    const api = harness({ revision: 1, status: 'idle', version: null, percent: null })
    let finish: (value: ApplicationUpdateSnapshot) => void = () => undefined
    api.get.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    render(
      <ApplicationUpdateProvider>
        <ApplicationUpdateControl />
      </ApplicationUpdateProvider>
    )
    api.publish({ revision: 4, status: 'downloading', version: '0.2.0', percent: 75 })
    await act(async () => {
      finish({ revision: 1, status: 'idle', version: null, percent: null })
    })
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75')
  })
})
