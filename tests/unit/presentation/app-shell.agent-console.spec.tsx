import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { AppShell } from '../../../src/presentation/app-shell/shell/AppShell'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

describe('app shell Agent console', () => {
  it('renders Codex as a dedicated canvas node instead of a terminal block', async () => {
    const baseWorkbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const workbench = {
      ...baseWorkbench,
      agents: [
        createAgent('agent-1', '实现 Agent', baseWorkbench.project.id),
        createAgent('agent-2', '审查 Agent', baseWorkbench.project.id, 680)
      ]
    }
    const inspectCodexCli = vi.fn(async () => ({
      status: 'installed' as const,
      version: 'codex-cli 0.144.6'
    }))

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        inspectCodexCli,
        listWorkbenches: vi.fn(async () => [workbench])
      })
    })

    render(<AppShell />)

    const canvas = screen.getByLabelText('积木画布')
    await waitFor(() =>
      expect(canvas.querySelectorAll('[data-agent-console-node]')).toHaveLength(2)
    )
    const agentConsole = canvas.querySelector('[data-agent-console-node="agent-1"]')

    expect(agentConsole).toHaveAttribute('aria-label', '实现 Agent 控制台')
    expect(agentConsole).toHaveClass('nowheel')
    expect(within(canvas).getByText('实现 Agent')).toBeInTheDocument()
    expect(within(canvas).getByText('审查 Agent')).toBeInTheDocument()
    expect(agentConsole?.querySelector('.agent-console__icon')).not.toBeInTheDocument()
    expect(agentConsole?.querySelector('.agent-console__heading span')).not.toBeInTheDocument()
    expect(
      within(canvas).queryByRole('complementary', { name: 'Agent 面板' })
    ).not.toBeInTheDocument()
    expect(agentConsole).not.toHaveAttribute('data-terminal-block-id')
    expect(inspectCodexCli).toHaveBeenCalledTimes(1)
  })

  it('renames an Agent by double-clicking its title', async () => {
    const baseWorkbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const first = createAgent('agent-1', 'Agent 1', baseWorkbench.project.id)
    const renamed = { ...first, name: '实现 Agent' }
    const renameWorkspaceAgent = vi.fn(async () => renamed)
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [{ ...baseWorkbench, agents: [first] }]),
        renameWorkspaceAgent
      })
    })

    render(<AppShell />)

    const agentConsole = await waitFor(() => {
      const node = document.querySelector('[data-agent-console-node="agent-1"]')
      expect(node).toBeInTheDocument()
      return node as HTMLElement
    })
    fireEvent.doubleClick(
      agentConsole.querySelector('[aria-label="Agent 1，双击重命名"]') as HTMLElement
    )
    const input = agentConsole.querySelector('[aria-label="Agent 名称"]') as HTMLInputElement
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: '实现 Agent' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => expect(agentConsole).toHaveTextContent('实现 Agent'))
    expect(renameWorkspaceAgent).toHaveBeenCalledWith({
      agentId: 'agent-1',
      name: '实现 Agent',
      projectId: baseWorkbench.project.id,
      workspaceId: 'main'
    })
  })

  it('creates another Agent with the compact default layout', async () => {
    const baseWorkbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const first = createAgent('agent-1', 'Agent 1', baseWorkbench.project.id)
    const second = createAgent('agent-2', 'Agent 2', baseWorkbench.project.id, 680)
    const createWorkspaceAgent = vi.fn(async () => second)
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        createWorkspaceAgent,
        listWorkbenches: vi.fn(async () => [{ ...baseWorkbench, agents: [first] }])
      })
    })

    render(<AppShell />)
    const createButton = await screen.findByRole('button', { name: '新建 Agent' })
    await waitFor(() => expect(createButton).toBeEnabled())
    fireEvent.click(createButton)
    await waitFor(() =>
      expect(document.querySelectorAll('[data-agent-console-node]')).toHaveLength(2)
    )

    const currentWorkspace = baseWorkbench.project.workspaces[0]!
    expect(createWorkspaceAgent).toHaveBeenCalledWith({
      agentId: expect.any(String),
      gitBranch: currentWorkspace.gitBranch,
      initialPosition: {
        x: expect.any(Number),
        y: expect.any(Number)
      },
      projectDirectory: baseWorkbench.project.directory,
      projectId: baseWorkbench.project.id,
      providerId: 'codex',
      workspaceDirectory: currentWorkspace.directory,
      workspaceId: currentWorkspace.workspaceId
    })
    expect(document.querySelector('[aria-label="移除 Agent 2"]')).not.toBeInTheDocument()
    expect(document.querySelector('[aria-label="Agent 2 更多操作"]')).toBeInTheDocument()
  })

  it('persists the CleanCode MCP switch through the application action hook', async () => {
    const baseWorkbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const first = createAgent('agent-1', 'Agent 1', baseWorkbench.project.id)
    const updateWorkspaceAgentMcpCapability = vi.fn(async () => ({
      agent: { ...first, cleancodeMcpEnabled: false },
      session: null
    }))
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [{ ...baseWorkbench, agents: [first] }]),
        updateWorkspaceAgentMcpCapability
      })
    })

    render(<AppShell />)
    const agentConsole = await waitFor(() => {
      const node = document.querySelector('[data-agent-console-node="agent-1"]')
      expect(node).toBeInTheDocument()
      return node as HTMLElement
    })
    const toggle = agentConsole.querySelector('[role="switch"]') as HTMLButtonElement
    fireEvent.click(toggle)

    await waitFor(() =>
      expect(updateWorkspaceAgentMcpCapability).toHaveBeenCalledWith({
        agentId: 'agent-1',
        cleancodeMcpEnabled: false,
        projectId: baseWorkbench.project.id,
        workspaceId: 'main'
      })
    )
    await waitFor(() =>
      expect(
        document.querySelector('[data-agent-console-node="agent-1"] [role="switch"]')
      ).toHaveAttribute('aria-checked', 'false')
    )
  })
})

function createAgent(agentId: string, name: string, projectId: string, x = 320) {
  return {
    agentId,
    cleancodeMcpEnabled: true,
    layout: { position: { x, y: 140 }, size: { width: 440, height: 520 } },
    name,
    projectId,
    providerId: 'codex',
    workspaceId: 'main'
  }
}
