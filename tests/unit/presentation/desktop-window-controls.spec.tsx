import { act, fireEvent, render, screen } from '@testing-library/react'
import { Dialog } from 'radix-ui'
import { DesktopWindowControls } from '../../../src/presentation/app-shell/shell/desktop-window-controls/DesktopWindowControls'
import type {
  DesktopWindowControlsApi,
  DesktopWindowState
} from '../../../src/platform/ipc/desktopWindowControls'
import { createDeferred } from '../../fixtures/deferred'

describe('desktop window caption buttons', () => {
  it('performs caption actions without dismissing an open modal', async () => {
    const perform = vi.fn().mockResolvedValue(undefined)
    const onOpenChange = vi.fn()
    vi.useFakeTimers()
    try {
      render(
        <>
          <DesktopWindowControls
            api={{
              perform,
              readState: async () => ({ focused: true, maximized: false }),
              onStateChange: () => () => undefined
            }}
          />
          <Dialog.Root open onOpenChange={onOpenChange}>
            <Dialog.Portal>
              <Dialog.Overlay data-testid="backdrop" />
              <Dialog.Content aria-describedby={undefined}>
                <Dialog.Title>Preview</Dialog.Title>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </>
      )
      // Radix installs its document pointer listener after the opening gesture.
      await act(async () => vi.advanceTimersByTimeAsync(0))
      for (const name of ['关闭窗口', '最小化窗口', '最大化窗口']) {
        const button = screen.getByLabelText(name)
        fireEvent.pointerDown(button, { button: 0 })
        fireEvent.click(button)
      }
      expect(perform.mock.calls).toEqual([['close'], ['minimize'], ['toggle-maximize']])
      expect(onOpenChange).not.toHaveBeenCalled()
      const backdrop = screen.getByTestId('backdrop')
      fireEvent.pointerDown(backdrop, { button: 0 })
      fireEvent.click(backdrop)
      expect(onOpenChange).toHaveBeenCalledWith(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('dispatches accessible actions and follows the latest native window state', async () => {
    const initial = createDeferred<DesktopWindowState>()
    const unsubscribe = vi.fn()
    let publish: (state: DesktopWindowState) => void = () => undefined
    const api: DesktopWindowControlsApi = {
      perform: vi.fn().mockResolvedValue(undefined),
      readState: () => initial.promise,
      onStateChange: (listener) => {
        publish = listener
        return unsubscribe
      }
    }
    const { unmount } = render(<DesktopWindowControls api={api} />)
    fireEvent.click(screen.getByRole('button', { name: '关闭窗口' }))
    fireEvent.click(screen.getByRole('button', { name: '最小化窗口' }))
    fireEvent.click(screen.getByRole('button', { name: '最大化窗口' }))
    act(() => publish({ maximized: true, focused: false }))
    const group = screen.getByRole('group', { name: '窗口控制' })
    expect(group).toHaveAttribute('data-inactive')
    act(() => publish({ maximized: true, focused: true }))
    expect(group).not.toHaveAttribute('data-inactive')
    await act(async () => {
      initial.resolve({ maximized: false, focused: false })
      await initial.promise
    })
    fireEvent.click(screen.getByRole('button', { name: '还原窗口' }))
    expect(api.perform).toHaveBeenNthCalledWith(1, 'close')
    expect(api.perform).toHaveBeenNthCalledWith(2, 'minimize')
    expect(api.perform).toHaveBeenNthCalledWith(3, 'toggle-maximize')
    expect(api.perform).toHaveBeenNthCalledWith(4, 'toggle-maximize')
    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
