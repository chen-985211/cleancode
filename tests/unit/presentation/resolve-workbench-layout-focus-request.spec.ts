import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { resolveWorkbenchLayoutFocusRequest } from '../../../src/presentation/app-shell/resolveWorkbenchLayoutFocusRequest'

describe('resolve workbench layout focus request', () => {
  it('focuses the invoking Agent, visible groups, and ungrouped arranged terminals', () => {
    expect(
      resolveWorkbenchLayoutFocusRequest({
        agentId: 'agent-1',
        change: {
          blockIds: ['backend', 'worker'],
          kind: 'terminal_layout_arranged',
          operationId: 'tool-call-1',
          terminalGroupIds: ['startup-group']
        },
        graph: createGraph()
      })
    ).toEqual({
      affectedNodeIds: ['backend', 'worker', 'startup-group'],
      expectedNodeLayouts: [
        {
          nodeId: 'startup-group',
          position: { x: 0, y: 0 },
          size: { width: 900, height: 500 }
        },
        {
          nodeId: 'worker',
          position: { x: 0, y: 0 },
          size: { width: 420, height: 306 }
        }
      ],
      focusNodeIds: ['agent:agent-1', 'startup-group', 'worker'],
      operationId: 'tool-call-1'
    })
  })

  it('does not request focus for an ordinary graph update', () => {
    expect(
      resolveWorkbenchLayoutFocusRequest({
        agentId: 'agent-1',
        graph: createGraph()
      })
    ).toBeNull()
  })
})

function createGraph(): BlockGraphSnapshot {
  return {
    blocks: [createTerminal('backend'), createTerminal('frontend'), createTerminal('worker')],
    id: 'graph-1',
    projectId: 'project-1',
    terminalGroups: [
      {
        id: 'startup-group',
        isCollapsed: false,
        memberBlockIds: ['backend', 'frontend'],
        name: '启动项目',
        position: { x: 0, y: 0 },
        size: { width: 900, height: 500 },
        type: 'terminal-group'
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    workspaceName: 'main'
  }
}

function createTerminal(id: string) {
  return {
    description: '',
    id,
    launchCommand: '',
    name: id,
    position: { x: 0, y: 0 },
    size: { width: 420, height: 306 },
    type: 'terminal' as const
  }
}
