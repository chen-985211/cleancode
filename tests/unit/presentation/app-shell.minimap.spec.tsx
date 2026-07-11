import { fireEvent, render, screen } from '@testing-library/react'

import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'
import { AppShell } from '../../../src/presentation/app-shell/AppShell'

describe('app shell minimap', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  it('keeps collapsed terminal groups visible in the minimap', async () => {
    const collapsedWorkbench = createTerminalGroupWorkbench(true)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [collapsedWorkbench])
      })
    })

    render(<AppShell />)

    expect(await screen.findByRole('button', { name: '聚焦终端组合 启动项目' })).toBeInTheDocument()
  })

  it('keeps expanded terminal groups out of the minimap', async () => {
    const expandedWorkbench = createTerminalGroupWorkbench(false)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [expandedWorkbench])
      })
    })

    render(<AppShell />)

    expect(await screen.findByRole('button', { name: '聚焦终端 Terminal 1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '聚焦终端组合 启动项目' })).not.toBeInTheDocument()
  })

  it('keeps the Agent console visible and selectable from the minimap', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench])
      })
    })

    render(<AppShell />)

    fireEvent.click(await screen.findByRole('button', { name: '聚焦 Agent Agent 1' }))

    expect(document.querySelector('[data-agent-console-node]')).toHaveClass(
      'agent-console-node--selected'
    )
  })
})

function createTerminalGroupWorkbench(isCollapsed: boolean) {
  const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')

  return {
    ...workbench,
    graph: {
      ...workbench.graph,
      blocks: [
        {
          id: 'terminal-1',
          type: 'terminal' as const,
          name: 'Terminal 1',
          description: '本地终端',
          launchCommand: '',
          position: { x: 680, y: 520 },
          size: { width: 420, height: 306 }
        },
        {
          id: 'terminal-2',
          type: 'terminal' as const,
          name: 'Terminal 2',
          description: '本地终端',
          launchCommand: '',
          position: { x: 1160, y: 520 },
          size: { width: 420, height: 306 }
        }
      ],
      terminalGroups: [
        {
          id: 'development-group',
          type: 'terminal-group' as const,
          name: '启动项目',
          memberBlockIds: ['terminal-1', 'terminal-2'],
          position: { x: 650, y: 480 },
          size: { width: 984, height: 458 },
          isCollapsed
        }
      ]
    }
  }
}
