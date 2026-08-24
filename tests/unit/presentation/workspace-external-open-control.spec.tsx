import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { I18nProvider } from '../../../src/presentation/app-shell/i18n/I18nProvider'
import { WorkspaceExternalOpenControl } from '../../../src/presentation/app-shell/WorkspaceExternalOpenControl'

describe('workspace external open control', () => {
  it('shows a VS Code primary action and a two-item menu when the protocol is available', async () => {
    const onOpen = vi.fn()
    const { rerender } = renderControl({
      capabilities: {
        vscode: { available: true, iconDataUrl: 'data:image/png;base64,vscode' }
      },
      onOpen,
      workspaceKey: 'project-1:main'
    })

    fireEvent.click(screen.getByRole('button', { name: '用 VS Code 打开' }))
    expect(onOpen).toHaveBeenCalledWith('vscode')

    fireEvent.click(screen.getByRole('button', { name: '选择打开方式' }))
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
    expect(screen.getByRole('menuitem', { name: '用 VS Code 打开' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '打开所在文件夹' })).toBeInTheDocument()

    rerender(
      <I18nProvider initialLocale="zh-CN">
        <WorkspaceExternalOpenControl
          key="project-1:feature"
          capabilities={{
            vscode: { available: true, iconDataUrl: 'data:image/png;base64,vscode' }
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
      capabilities: { vscode: { available: false, iconDataUrl: null } },
      onOpen
    })

    fireEvent.click(screen.getByRole('button', { name: '打开所在文件夹' }))

    expect(onOpen).toHaveBeenCalledWith('folder')
    expect(screen.queryByRole('button', { name: '选择打开方式' })).not.toBeInTheDocument()
  })

  it('disables the complete control while an external open is pending', () => {
    renderControl({
      capabilities: { vscode: { available: true, iconDataUrl: null } },
      isPending: true
    })

    expect(screen.getByRole('button', { name: '用 VS Code 打开' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '选择打开方式' })).toBeDisabled()
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
        capabilities={capabilities ?? { vscode: { available: false, iconDataUrl: null } }}
        isPending={isPending}
        onOpen={onOpen}
      />
    </I18nProvider>
  )
}
