import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import type { TerminalBlockSnapshot } from '../../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { I18nProvider } from '../../../../src/presentation/i18n/I18nProvider'
import { TerminalMetadataForm } from '../../../../src/contexts/block-graph/presentation/components/TerminalMetadataForm'

describe('terminal definition editing', () => {
  it('closes a configuration menu with Escape without cancelling or submitting the form', () => {
    const onCancel = vi.fn()
    const onSave = vi.fn(async () => undefined)
    render(
      <TerminalMetadataForm
        block={createBlock()}
        shouldFocusLaunchCommand={false}
        onSave={onSave}
        onCancel={onCancel}
      />
    )
    choose('运行模式', 'service')
    const trigger = screen.getByRole('button', { name: '服务就绪方式' })
    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(onCancel).not.toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

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

    expect(within(form).getByText('编辑终端')).toBeVisible()
    expect(screen.getByLabelText('终端名称')).toHaveFocus()
    expect(screen.getByRole('button', { name: '保存终端信息' })).toHaveTextContent('保存')
    expect(screen.getByRole('button', { name: '取消编辑终端信息' })).toHaveTextContent('取消')

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

  it('edits long descriptions and commands across lines and saves their literal content', async () => {
    const onSave = vi.fn(async () => undefined)
    render(
      <TerminalMetadataForm
        block={createBlock()}
        shouldFocusLaunchCommand
        onSave={onSave}
        onCancel={vi.fn()}
      />
    )
    const description = screen.getByRole('textbox', { name: '终端描述' })
    const command = screen.getByRole('textbox', { name: '启动命令' })
    expect(description.tagName).toBe('TEXTAREA')
    expect(command.tagName).toBe('TEXTAREA')
    expect(command).toHaveFocus()
    expect(command).toHaveAttribute('wrap', 'soft')
    const literalCommand = 'printf "first line"\nprintf "second line"'
    fireEvent.change(description, { target: { value: 'First line\nSecond line' } })
    fireEvent.change(command, { target: { value: literalCommand } })
    fireEvent.keyDown(command, { key: 'Enter' })
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('保存终端信息'))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'First line\nSecond line',
          launchCommand: literalCommand
        }),
        createBlock().executionConfig
      )
    )
  })

  it('shows task conditions immediately and preserves them across mode changes', () => {
    const block = {
      ...createBlock(),
      executionConfig: { mode: 'task' as const, successExitCodes: [0, 2], timeoutMs: 120_000 }
    }
    render(
      <TerminalMetadataForm
        block={block}
        shouldFocusLaunchCommand={false}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByLabelText('成功退出码')).toBeVisible()
    expect(screen.getByLabelText('成功退出码')).toHaveValue('0,2')
    expect(screen.getByLabelText('任务超时')).toBeVisible()
    expect(screen.getByLabelText('任务超时')).toHaveValue('120')
    fireEvent.change(screen.getByLabelText('任务超时'), { target: { value: '90' } })
    choose('运行模式', 'service')
    fireEvent.change(screen.getByLabelText('服务就绪文本'), { target: { value: 'server ready' } })
    choose('运行模式', 'task')
    expect(screen.getByLabelText('任务超时')).toHaveValue('90')
    expect(screen.getByLabelText('任务超时')).toBeVisible()
    choose('运行模式', 'service')
    expect(screen.getByLabelText('服务就绪文本')).toHaveValue('server ready')
  })

  it.each([
    {
      policy: { type: 'fixed' as const, port: 4321 },
      binding: { type: 'none' as const },
      policyLabel: '固定端口'
    },
    {
      policy: { type: 'preferred' as const, port: 5173 },
      binding: { type: 'environment' as const, variableName: 'APP_PORT' },
      policyLabel: '首选端口，可自动回退'
    },
    {
      policy: { type: 'auto' as const },
      binding: { type: 'argument' as const, template: '--port {port}' },
      policyLabel: '自动分配端口'
    }
  ])(
    'shows all applicable saved service fields without expansion: $policyLabel',
    async ({ policy, binding, policyLabel }) => {
      const executionConfig = {
        mode: 'service' as const,
        readiness: { type: 'tcp' as const },
        readinessTimeoutMs: 30_000,
        port: { protocol: 'tcp' as const, policy, binding }
      }
      const onSave = vi.fn(async () => undefined)
      render(
        <TerminalMetadataForm
          block={{ ...createBlock(), executionConfig }}
          shouldFocusLaunchCommand={false}
          onSave={onSave}
          onCancel={vi.fn()}
        />
      )
      expect(screen.getByLabelText('服务就绪方式')).toBeVisible()
      expect(screen.getByLabelText('服务就绪超时')).toBeVisible()
      expect(screen.getByLabelText('端口策略')).toBeVisible()
      expect(screen.getByLabelText('端口策略')).toHaveTextContent(policyLabel)
      expect(screen.getByLabelText('访问协议')).toBeVisible()
      expect(screen.getByLabelText('端口注入方式')).toBeVisible()
      if ('port' in policy) {
        expect(screen.getByLabelText('服务端口')).toBeVisible()
        expect(screen.getByLabelText('服务端口')).toHaveValue(String(policy.port))
      }
      if (binding.type === 'environment') {
        expect(screen.getByLabelText('环境变量名称')).toBeVisible()
        expect(screen.getByLabelText('环境变量名称')).toHaveValue(binding.variableName)
      }
      if (binding.type === 'argument') {
        expect(screen.getByLabelText('端口参数后缀')).toBeVisible()
        expect(screen.getByLabelText('端口参数后缀')).toHaveValue(binding.template)
      }
      fireEvent.click(screen.getByLabelText('保存终端信息'))
      await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.anything(), executionConfig))
    }
  )

  it('shows validation beside visible task and service fields', () => {
    render(
      <TerminalMetadataForm
        block={{
          ...createBlock(),
          executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: -1 }
        }}
        shouldFocusLaunchCommand={false}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByLabelText('任务超时')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('任务超时必须是大于 0 的秒数')
    choose('运行模式', 'service')
    expect(screen.getByLabelText('端口策略')).toBeVisible()
    choose('服务就绪方式', 'tcp')
    expect(screen.getByRole('button', { name: '端口策略' })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('TCP 就绪需要先配置端口策略')
    expect(screen.getByLabelText('保存终端信息')).toBeDisabled()
  })

  it('keeps fields visible and focused while correcting an invalid draft', () => {
    render(
      <TerminalMetadataForm
        block={{
          ...createBlock(),
          executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: -1 }
        }}
        shouldFocusLaunchCommand={false}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    const timeout = screen.getByLabelText('任务超时')
    expect(timeout).toBeVisible()
    timeout.focus()
    fireEvent.change(timeout, { target: { value: '120' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(timeout).toBeVisible()
    expect(timeout).toHaveFocus()
  })

  it('localizes the mode controls and directly editable fields in English', () => {
    render(
      <I18nProvider initialLocale="en">
        <TerminalMetadataForm
          block={createBlock()}
          shouldFocusLaunchCommand={false}
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      </I18nProvider>
    )
    expect(screen.getByRole('radio', { name: 'Task' })).toBeChecked()
    expect(screen.getByLabelText('Successful exit codes')).toBeVisible()
    expect(screen.getByLabelText('Task timeout')).toBeVisible()
    fireEvent.click(screen.getByRole('radio', { name: 'Service' }))
    expect(screen.getByLabelText('Service readiness method')).toBeVisible()
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

    choose('运行模式', 'service')
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

    choose('运行模式', 'service')
    choose('服务就绪方式', 'tcp')
    choose('端口策略', 'fixed')
    choose('访问协议', 'tcp')
    fireEvent.change(screen.getByLabelText('服务端口'), { target: { value: '4321' } })
    choose('端口注入方式', 'none')
    expect(screen.getByLabelText('服务端口')).toBeVisible()
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

    choose('运行模式', 'service')
    choose('端口策略', 'preferred')

    expect(screen.getByRole('button', { name: '端口注入方式' })).toHaveTextContent(
      '环境变量（推荐）'
    )
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

    choose('运行模式', 'service')
    choose('端口策略', 'auto')
    choose('端口注入方式', 'argument')
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

function choose(label: string, value: string): void {
  if (label === '运行模式') {
    fireEvent.click(screen.getByRole('radio', { name: value === 'task' ? '任务' : '服务' }))
    return
  }
  fireEvent.click(screen.getByRole('button', { name: label }))
  const option = screen
    .getByRole('menu')
    .querySelector<HTMLButtonElement>(`[data-choice-value="${value}"]`)
  expect(option).not.toBeNull()
  fireEvent.click(option!)
}
