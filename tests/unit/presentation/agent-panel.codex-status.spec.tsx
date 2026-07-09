import { render, screen, waitFor } from '@testing-library/react'

import { AgentPanel } from '../../../src/presentation/app-shell/AgentPanel'
import { createRuntimeApi } from '../../fixtures/presentation/appShellFixtures'

describe('agent panel Codex status', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  it('shows the installed Codex CLI version', async () => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        inspectCodexCli: vi.fn(async () => ({
          installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
          status: 'installed',
          version: 'codex-cli 0.143.0'
        }))
      })
    })

    render(<AgentPanel />)

    expect(await screen.findAllByText('已安装')).toHaveLength(2)
    expect(screen.getByText('codex-cli 0.143.0')).toBeInTheDocument()
  })

  it('shows a quick install command when Codex CLI is missing', async () => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        inspectCodexCli: vi.fn(async () => ({
          installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
          status: 'missing',
          version: null
        }))
      })
    })

    render(<AgentPanel />)

    expect(await screen.findAllByText('未安装')).toHaveLength(2)
    expect(
      screen.getByText('curl -fsSL https://chatgpt.com/codex/install.sh | sh')
    ).toBeInTheDocument()
  })

  it('keeps the browser preview honest when the desktop runtime is unavailable', async () => {
    render(<AgentPanel />)

    await waitFor(() => expect(screen.getByText('桌面运行时未连接。')).toBeInTheDocument())
    expect(screen.queryByText('已安装')).not.toBeInTheDocument()
    expect(screen.queryByText('未安装')).not.toBeInTheDocument()
  })
})
