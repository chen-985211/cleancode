import { createAgentConsoleFlowNode } from '../../../src/presentation/app-shell/agentConsoleFlowNode'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('Agent console flow node', () => {
  it('stays distinct from terminal blocks and only drags from its header', () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app')
    const currentWorkspace = workbench.project.workspaces[0]!
    const node = createAgentConsoleFlowNode({
      currentWorkbench: workbench,
      currentWorkspace,
      isSelected: false,
      onGraphUpdated: vi.fn()
    })

    expect(node).toMatchObject({
      dragHandle: '.agent-console__header',
      id: 'agent-console',
      selected: false,
      type: 'agentConsole'
    })
    expect(node.data.currentWorkspace).toBe(currentWorkspace)
    expect(node.data).not.toHaveProperty('block')
  })
})
