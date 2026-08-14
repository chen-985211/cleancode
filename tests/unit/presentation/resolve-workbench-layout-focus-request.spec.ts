import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { resolveWorkbenchLayoutFocusRequest } from '../../../src/presentation/app-shell/resolveWorkbenchLayoutFocusRequest'

describe('resolve workbench layout focus request', () => {
  it('focuses visible groups and ungrouped arranged terminals without forcing the Agent into view', () => {
    expect(
      resolveWorkbenchLayoutFocusRequest({
        originAgentNodeId: 'agent:agent-1',
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
      focusTarget: 'projected-nodes',
      focusNodeIds: ['startup-group', 'worker'],
      operationId: 'tool-call-1'
    })
  })

  it('frames the committed destination before an atomic workflow finishes entering', () => {
    expect(
      resolveWorkbenchLayoutFocusRequest({
        originAgentNodeId: 'agent:agent-1',
        change: {
          blockIds: ['worker'],
          connectionIds: [],
          kind: 'terminal_build_created',
          operationId: 'tool-call-2',
          terminalGroupIds: []
        },
        graph: createGraph()
      })
    ).toMatchObject({
      expectedNodeLayouts: [
        {
          nodeId: 'worker',
          position: { x: 0, y: 0 },
          size: { width: 420, height: 306 }
        }
      ],
      focusNodeIds: ['agent:agent-1', 'worker'],
      focusTarget: 'committed-layouts'
    })
  })

  it('does not request focus for an ordinary graph update', () => {
    expect(
      resolveWorkbenchLayoutFocusRequest({
        originAgentNodeId: 'agent:agent-1',
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
    workspaceId: 'main'
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
