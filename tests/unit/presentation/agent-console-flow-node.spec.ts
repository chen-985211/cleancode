import { createAgentConsoleFlowNode } from '../../../src/presentation/app-shell/agentConsoleFlowNode'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('Agent console flow node', () => {
  it('stays distinct from terminal blocks and only drags from its header', () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app')
    const currentWorkspace = workbench.project.workspaces[0]!
    const node = createAgentConsoleFlowNode({
      agent: {
        agentId: 'agent-1',
        layout: { position: { x: 320, y: 140 }, size: { width: 520, height: 460 } },
        name: '实现 Agent',
        projectId: workbench.project.id,
        workspaceName: currentWorkspace.name
      },
      currentWorkbench: workbench,
      currentWorkspace,
      isSelected: false,
      onGraphUpdated: vi.fn(),
      onRemove: vi.fn(async () => undefined),
      onRename: vi.fn(async () => undefined),
      onResize: vi.fn(async () => undefined),
      onSelect: vi.fn()
    })

    expect(node).toMatchObject({
      dragHandle: '.agent-console__header',
      id: 'agent:agent-1',
      position: { x: 320, y: 140 },
      selectable: false,
      selected: false,
      type: 'agentConsole'
    })
    expect(node.data.currentWorkspace).toBe(currentWorkspace)
    expect(node.data.agent.name).toBe('实现 Agent')
    expect(node.data).not.toHaveProperty('block')
  })
})
