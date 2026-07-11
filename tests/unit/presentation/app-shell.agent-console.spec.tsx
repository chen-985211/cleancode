import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { AppShell } from '../../../src/presentation/app-shell/AppShell'
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

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
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
      workspaceName: 'main'
    })
  })

  it('creates and removes one Agent while preserving its sibling', async () => {
    const baseWorkbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const first = createAgent('agent-1', 'Agent 1', baseWorkbench.project.id)
    const second = createAgent('agent-2', 'Agent 2', baseWorkbench.project.id, 680)
    const createWorkspaceAgent = vi.fn(async () => second)
    const removeWorkspaceAgent = vi.fn(async () => [first])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        createWorkspaceAgent,
        listWorkbenches: vi.fn(async () => [{ ...baseWorkbench, agents: [first] }]),
        removeWorkspaceAgent
      })
    })

    render(<AppShell />)
    fireEvent.click(await screen.findByRole('button', { name: '新建 Agent' }))
    await waitFor(() =>
      expect(document.querySelectorAll('[data-agent-console-node]')).toHaveLength(2)
    )

    expect(document.querySelector('[aria-label="Agent 2 更多操作"]')).not.toBeInTheDocument()
    fireEvent.click(document.querySelector('[aria-label="移除 Agent 2"]')!)
    const dialog = document.querySelector('[aria-label="移除 Agent"]')!
    fireEvent.click(within(dialog as HTMLElement).getByText('移除'))

    await waitFor(() =>
      expect(document.querySelectorAll('[data-agent-console-node]')).toHaveLength(1)
    )
    expect(screen.getByText('Agent 1')).toBeInTheDocument()
    expect(removeWorkspaceAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'agent-2' })
    )
  })
})

function createAgent(agentId: string, name: string, projectId: string, x = 320) {
  return {
    agentId,
    layout: { position: { x, y: 140 }, size: { width: 440, height: 520 } },
    name,
    projectId,
    workspaceName: 'main'
  }
}
