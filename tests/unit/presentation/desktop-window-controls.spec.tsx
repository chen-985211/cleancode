import { act, fireEvent, render, screen } from '@testing-library/react'
import { DesktopWindowControls } from '../../../src/presentation/app-shell/shell/desktop-window-controls/DesktopWindowControls'
import type { DesktopWindowControlsApi } from '../../../src/platform/ipc/desktopWindowControls'
import { createDeferred } from '../../fixtures/deferred'

describe('desktop window caption buttons', () => {
  it('dispatches accessible actions and follows the latest native window state', async () => {
    const initial = createDeferred<boolean>()
    const unsubscribe = vi.fn()
    let publish: (maximized: boolean) => void = () => undefined
    const api: DesktopWindowControlsApi = {
      perform: vi.fn().mockResolvedValue(undefined),
      isMaximized: () => initial.promise,
      onMaximizedChange: (listener) => {
        publish = listener
        return unsubscribe
      }
    }
    const { unmount } = render(<DesktopWindowControls api={api} />)
    fireEvent.click(screen.getByRole('button', { name: '关闭窗口' }))
    fireEvent.click(screen.getByRole('button', { name: '最小化窗口' }))
    fireEvent.click(screen.getByRole('button', { name: '最大化窗口' }))
    act(() => publish(true))
    await act(async () => {
      initial.resolve(false)
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
