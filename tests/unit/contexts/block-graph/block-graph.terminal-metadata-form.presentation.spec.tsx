import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import type { TerminalBlockSnapshot } from '../../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { TerminalMetadataForm } from '../../../../src/contexts/block-graph/presentation/components/TerminalMetadataForm'

describe('terminal workflow advanced configuration', () => {
  it('opens with a visible editing context, focuses the intended field, and cancels with Escape', () => {
    const onCancel = vi.fn()
    const { rerender } = render(
      <TerminalMetadataForm
        block={createBlock()}
        shouldFocusLaunchCommand={false}
        onSave={vi.fn(async () => undefined)}
        onCancel={onCancel}
      />
    )

    const form = screen.getByRole('form', { name: '编辑终端信息' })

    expect(within(form).getByText('编辑终端信息')).toBeVisible()
    expect(screen.getByLabelText('终端名称')).toHaveFocus()
    expect(screen.getByRole('button', { name: '保存终端信息' })).toHaveTextContent('保存终端信息')
    expect(screen.getByRole('button', { name: '取消编辑终端信息' })).toHaveTextContent('取消编辑')

    fireEvent.keyDown(screen.getByLabelText('终端名称'), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)

    rerender(
      <TerminalMetadataForm
        block={createBlock()}
        shouldFocusLaunchCommand
        onSave={vi.fn(async () => undefined)}
        onCancel={onCancel}
      />
    )

    expect(screen.getByLabelText('启动命令')).toHaveFocus()
  })

  it('saves literal-output service readiness together with terminal metadata', async () => {
    const onSave = vi.fn(async () => undefined)
    render(
      <TerminalMetadataForm
        block={createBlock()}
        shouldFocusLaunchCommand={false}
        onSave={onSave}
        onCancel={() => undefined}
      />
    )

    fireEvent.change(screen.getByLabelText('运行模式'), { target: { value: 'service' } })
    fireEvent.change(screen.getByLabelText('服务就绪文本'), {
      target: { value: ' API ready ' }
    })
    fireEvent.change(screen.getByLabelText('服务就绪超时'), { target: { value: '45' } })
    fireEvent.click(screen.getByLabelText('保存终端信息'))

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ launchCommand: 'pnpm dev' }), {
        mode: 'service',
        readiness: { type: 'output', text: 'API ready' },
        readinessTimeoutMs: 45_000
      })
    )
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('saves a fixed TCP service with an explicit no-injection binding', async () => {
    const onSave = vi.fn(async () => undefined)
    render(
      <TerminalMetadataForm
        block={createBlock()}
        shouldFocusLaunchCommand={false}
        onSave={onSave}
        onCancel={() => undefined}
      />
    )

    fireEvent.change(screen.getByLabelText('运行模式'), { target: { value: 'service' } })
    fireEvent.change(screen.getByLabelText('服务就绪方式'), { target: { value: 'tcp' } })
    fireEvent.change(screen.getByLabelText('端口策略'), { target: { value: 'fixed' } })
    fireEvent.change(screen.getByLabelText('访问协议'), { target: { value: 'tcp' } })
    fireEvent.change(screen.getByLabelText('服务端口'), { target: { value: '4321' } })
    fireEvent.change(screen.getByLabelText('端口注入方式'), { target: { value: 'none' } })
    fireEvent.click(screen.getByLabelText('保存终端信息'))

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ launchCommand: 'pnpm dev' }), {
        mode: 'service',
        readiness: { type: 'tcp' },
        readinessTimeoutMs: 30_000,
        port: {
          protocol: 'tcp',
          policy: { type: 'fixed', port: 4321 },
          binding: { type: 'none' }
        }
      })
    )
  })

  it('recommends environment injection without guessing an environment variable', () => {
    render(
      <TerminalMetadataForm
        block={createBlock()}
        shouldFocusLaunchCommand={false}
        onSave={vi.fn(async () => undefined)}
        onCancel={() => undefined}
      />
    )

    fireEvent.change(screen.getByLabelText('运行模式'), { target: { value: 'service' } })
    fireEvent.change(screen.getByLabelText('端口策略'), { target: { value: 'preferred' } })

    expect(screen.getByLabelText('端口注入方式')).toHaveValue('environment')
    expect(screen.getByLabelText('环境变量名称')).toHaveValue('')
    expect(screen.getByLabelText('服务端口')).toHaveValue('')
    fireEvent.change(screen.getByLabelText('服务端口'), { target: { value: '5173' } })
    expect(screen.getByText('推荐使用环境变量注入；请填写项目实际读取的变量名。')).toBeVisible()
    expect(screen.getByLabelText('保存终端信息')).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('请填写有效的环境变量名称')
  })

  it('rejects shell control operators in an argument suffix', () => {
    render(
      <TerminalMetadataForm
        block={createBlock()}
        shouldFocusLaunchCommand={false}
        onSave={vi.fn(async () => undefined)}
        onCancel={() => undefined}
      />
    )

    fireEvent.change(screen.getByLabelText('运行模式'), { target: { value: 'service' } })
    fireEvent.change(screen.getByLabelText('端口策略'), { target: { value: 'auto' } })
    fireEvent.change(screen.getByLabelText('端口注入方式'), { target: { value: 'argument' } })
    fireEvent.change(screen.getByLabelText('端口参数后缀'), {
      target: { value: '--port {port}; rm -rf project' }
    })

    expect(screen.getByLabelText('保存终端信息')).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      '参数后缀必须只包含安全参数，并且恰好包含一个 {port}'
    )
  })

  it('disables duplicate submission and keeps the draft visible after a save failure', async () => {
    let rejectSave!: (error: Error) => void
    const onSave = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject
        })
    )
    render(
      <TerminalMetadataForm
        block={createBlock()}
        shouldFocusLaunchCommand={false}
        onSave={onSave}
        onCancel={() => undefined}
      />
    )

    fireEvent.change(screen.getByLabelText('终端名称'), { target: { value: 'API draft' } })
    fireEvent.click(screen.getByLabelText('保存终端信息'))

    expect(screen.getByLabelText('保存终端信息')).toBeDisabled()
    expect(screen.getByLabelText('取消编辑终端信息')).toBeDisabled()
    expect(screen.getByLabelText('保存终端信息')).toHaveAttribute('aria-busy', 'true')

    rejectSave(new Error('disk unavailable'))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('保存失败，请重试。'))
    expect(screen.getByLabelText('终端名称')).toHaveValue('API draft')
    expect(screen.getByLabelText('保存终端信息')).toBeEnabled()
  })

  it('does not save an invalid task timeout', () => {
    const onSave = vi.fn(async () => undefined)
    render(
      <TerminalMetadataForm
        block={createBlock()}
        shouldFocusLaunchCommand={false}
        onSave={onSave}
        onCancel={() => undefined}
      />
    )

    fireEvent.change(screen.getByLabelText('任务超时'), { target: { value: '0' } })

    expect(screen.getByLabelText('保存终端信息')).toBeDisabled()
  })
})

function createBlock(): TerminalBlockSnapshot {
  return {
    id: 'api',
    type: 'terminal',
    name: 'API',
    description: 'API service',
    launchCommand: 'pnpm dev',
    executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
    position: { x: 0, y: 0 },
    size: { width: 560, height: 360 }
  }
}
