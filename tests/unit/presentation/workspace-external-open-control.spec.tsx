import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { WorkspaceExternalOpenControl } from '../../../src/contexts/project/presentation/components/WorkspaceExternalOpenControl'
import { I18nProvider } from '../../../src/presentation/i18n/I18nProvider'

describe('workspace external open control', () => {
  it('shows a VS Code primary action and a two-item menu when the protocol is available', async () => {
    const onOpen = vi.fn()
    const { rerender } = renderControl({
      capabilities: {
        vscode: { available: true }
      },
      onOpen,
      workspaceKey: 'project-1:main'
    })

    const primaryAction = screen.getByRole('button', { name: '用 VS Code 打开' })
    expect(
      primaryAction.querySelector('.workspace-external-open-control__app-icon')
    ).toHaveAttribute('aria-hidden', 'true')

    fireEvent.click(primaryAction)
    expect(onOpen).toHaveBeenCalledWith('vscode')

    fireEvent.click(screen.getByRole('button', { name: '选择打开方式' }))
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
    const vscodeMenuItem = screen.getByRole('menuitem', { name: '用 VS Code 打开' })
    expect(vscodeMenuItem).toBeInTheDocument()
    expect(
      vscodeMenuItem.querySelector('.workspace-external-open-control__app-icon')
    ).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('menuitem', { name: '打开所在文件夹' })).toBeInTheDocument()

    rerender(
      <I18nProvider initialLocale="zh-CN">
        <WorkspaceExternalOpenControl
          key="project-1:feature"
          capabilities={{
            vscode: { available: true }
          }}
          isPending={false}
          onOpen={onOpen}
        />
      </I18nProvider>
    )
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('shows only the folder action when VS Code is unavailable', () => {
    const onOpen = vi.fn()
    renderControl({
      capabilities: { vscode: { available: false } },
      onOpen
    })

    fireEvent.click(screen.getByRole('button', { name: '打开所在文件夹' }))

    expect(onOpen).toHaveBeenCalledWith('folder')
    expect(screen.queryByRole('button', { name: '选择打开方式' })).not.toBeInTheDocument()
  })

  it('does not consume the first folder action after availability drops with the menu open', () => {
    const onOpen = vi.fn()
    const view = renderControl({
      capabilities: { vscode: { available: true } },
      onOpen
    })
    fireEvent.click(screen.getByRole('button', { name: '选择打开方式' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    view.rerender(
      <I18nProvider initialLocale="zh-CN">
        <WorkspaceExternalOpenControl
          key="project-1:main"
          capabilities={{ vscode: { available: false } }}
          isPending={false}
          onOpen={onOpen}
        />
      </I18nProvider>
    )
    const folderAction = screen.getByRole('button', { name: '打开所在文件夹' })

    fireEvent.pointerDown(folderAction, { pointerId: 1 })
    fireEvent.pointerUp(folderAction, { pointerId: 1 })
    fireEvent.click(folderAction)

    expect(onOpen).toHaveBeenCalledWith('folder')
  })

  it('does not revive a stale menu when VS Code availability returns', () => {
    const view = renderControl({
      capabilities: { vscode: { available: true } }
    })
    fireEvent.click(screen.getByRole('button', { name: '选择打开方式' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    view.rerender(
      <I18nProvider initialLocale="zh-CN">
        <WorkspaceExternalOpenControl
          key="project-1:main"
          capabilities={{ vscode: { available: false } }}
          isPending={false}
          onOpen={vi.fn()}
        />
      </I18nProvider>
    )
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    view.rerender(
      <I18nProvider initialLocale="zh-CN">
        <WorkspaceExternalOpenControl
          key="project-1:main"
          capabilities={{ vscode: { available: true } }}
          isPending={false}
          onOpen={vi.fn()}
        />
      </I18nProvider>
    )

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('keeps the complete control focusable while gating submissions during pending', () => {
    const onOpen = vi.fn()
    renderControl({
      capabilities: { vscode: { available: true } },
      isPending: true,
      onOpen
    })

    const primaryAction = screen.getByRole('button', { name: '用 VS Code 打开' })
    const menuTrigger = screen.getByRole('button', { name: '选择打开方式' })
    primaryAction.focus()

    expect(primaryAction).toHaveFocus()
    expect(primaryAction).not.toBeDisabled()
    expect(primaryAction).toHaveAttribute('aria-disabled', 'true')
    expect(menuTrigger).not.toBeDisabled()
    expect(menuTrigger).toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(primaryAction)
    fireEvent.click(menuTrigger)

    expect(onOpen).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('uses pointer proximity only for feedback instead of changing the menu state', () => {
    renderControl({
      capabilities: { vscode: { available: true } }
    })

    const control = screen.getByRole('group', { name: '打开当前工作区' })
    fireEvent.pointerEnter(control, { pointerType: 'mouse' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '选择打开方式' }))
    const menu = screen.getByRole('menu')
    expect(menu).toHaveAttribute('data-surface-spring-preset', 'anchored-bottom-left')
    fireEvent.pointerLeave(control, { pointerType: 'mouse' })
    fireEvent.pointerLeave(menu, { pointerType: 'mouse' })
    expect(screen.getByRole('menu')).toBe(menu)
  })

  it('keeps the portaled menu anchored while its status bar moves', async () => {
    renderControl({
      capabilities: { vscode: { available: true } }
    })
    const control = screen.getByRole('group', { name: '打开当前工作区' })
    let controlLeft = 24
    const controlRect = vi.spyOn(control, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          bottom: 726,
          height: 26,
          left: controlLeft,
          right: controlLeft + 60,
          top: 700,
          width: 60,
          x: controlLeft,
          y: 700,
          toJSON: () => undefined
        }) as DOMRect
    )

    fireEvent.click(screen.getByRole('button', { name: '选择打开方式' }))
    const menu = screen.getByRole('menu')
    await waitFor(() => expect(menu.style.left).toBe('24px'))

    controlLeft = 304
    const statusbar = control.parentElement
    expect(statusbar).not.toBeNull()
    statusbar?.style.setProperty('transform', 'translate3d(280px, 0, 0)')

    await waitFor(() => expect(menu.style.left).toBe('304px'))
    controlRect.mockRestore()
  })

  it('keeps click focus on the trigger and moves focus into the menu for arrow-key open', async () => {
    const { unmount } = renderControl({
      capabilities: { vscode: { available: true } }
    })
    const pointerTrigger = screen.getByRole('button', { name: '选择打开方式' })
    pointerTrigger.focus()

    fireEvent.click(pointerTrigger)
    expect(pointerTrigger).toHaveFocus()
    unmount()

    renderControl({
      capabilities: { vscode: { available: true } }
    })
    const keyboardTrigger = screen.getByRole('button', { name: '选择打开方式' })
    keyboardTrigger.focus()
    fireEvent.keyDown(keyboardTrigger, { key: 'ArrowUp' })

    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: '打开所在文件夹' })).toHaveFocus()
    )
  })

  it('routes arrow keys from the focused trigger into an already-open menu', () => {
    renderControl({
      capabilities: { vscode: { available: true } }
    })
    const trigger = screen.getByRole('button', { name: '选择打开方式' })
    trigger.focus()
    fireEvent.click(trigger)

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: '用 VS Code 打开' })).toHaveFocus()

    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowUp' })
    expect(screen.getByRole('menuitem', { name: '打开所在文件夹' })).toHaveFocus()
  })

  it('keeps the menu trigger focused when a selected action enters pending', () => {
    const onOpen = vi.fn()
    const view = renderControl({
      capabilities: { vscode: { available: true } },
      onOpen
    })
    const trigger = screen.getByRole('button', { name: '选择打开方式' })
    trigger.focus()
    fireEvent.click(trigger)

    const folderAction = screen.getByRole('menuitem', { name: '打开所在文件夹' })
    folderAction.focus()
    fireEvent.click(folderAction)
    expect(trigger).toHaveFocus()

    view.rerender(
      <I18nProvider initialLocale="zh-CN">
        <WorkspaceExternalOpenControl
          key="project-1:main"
          capabilities={{ vscode: { available: true } }}
          isPending
          onOpen={onOpen}
        />
      </I18nProvider>
    )

    expect(trigger).toHaveFocus()
    expect(trigger).not.toBeDisabled()
    expect(trigger).toHaveAttribute('aria-disabled', 'true')
  })

  it('reuses the live menu surface when a repeated click reverses its exit', () => {
    renderControl({
      capabilities: { vscode: { available: true } }
    })
    const trigger = screen.getByRole('button', { name: '选择打开方式' })

    fireEvent.click(trigger)
    const menu = screen.getByRole('menu')
    fireEvent.click(trigger)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(menu).toHaveAttribute('data-surface-motion-state', 'closing')

    fireEvent.click(trigger)
    expect(screen.getByRole('menu')).toBe(menu)
    expect(menu).toHaveAttribute('data-surface-motion-state', 'opening')
  })
})

function renderControl({
  capabilities,
  isPending = false,
  onOpen = vi.fn(),
  workspaceKey = 'project-1:main'
}: Partial<React.ComponentProps<typeof WorkspaceExternalOpenControl>> & {
  readonly workspaceKey?: string
} = {}) {
  return render(
    <I18nProvider initialLocale="zh-CN">
      <WorkspaceExternalOpenControl
        key={workspaceKey}
        capabilities={capabilities ?? { vscode: { available: false } }}
        isPending={isPending}
        onOpen={onOpen}
      />
    </I18nProvider>
  )
}
