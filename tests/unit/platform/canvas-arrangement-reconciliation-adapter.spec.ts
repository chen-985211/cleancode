import type { WorkspaceAgentSnapshot } from '../../../src/contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { CanvasArrangementSnapshot } from '../../../src/contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import { resolveValidCanvasArrangementItemKeys } from '../../../src/platform/electron-main/canvasArrangementReconciliationAdapter'

describe('canvas arrangement reconciliation adapter', () => {
  it('keeps only references that still represent complete canvas objects', () => {
    const arrangement: CanvasArrangementSnapshot = {
      projectId: 'project-1',
      workspaceId: 'main',
      stacks: [
        {
          id: 'stack-1',
          anchor: { x: 0, y: 0 },
          items: [
            { kind: 'workflow', terminalIds: ['terminal-a', 'terminal-b'] },
            { kind: 'terminal', terminalId: 'terminal-c' },
            { kind: 'terminal', terminalId: 'terminal-d' },
            { kind: 'combination', terminalGroupId: 'group-1' },
            { kind: 'agent', agentId: 'agent-1' },
            { kind: 'agent', agentId: 'missing-agent' },
            {
              kind: 'workflow',
              terminalIds: ['terminal-a', 'terminal-b', 'terminal-c']
            }
          ]
        }
      ]
    }
    const graph = {
      blocks: ['terminal-a', 'terminal-b', 'terminal-c', 'terminal-d'].map((id) => ({ id })),
      connections: [{ sourceBlockId: 'terminal-a', targetBlockId: 'terminal-b' }],
      terminalGroups: [{ id: 'group-1', memberBlockIds: ['terminal-c'] }]
    } as unknown as BlockGraphSnapshot
    const agents = [{ agentId: 'agent-1' }] as WorkspaceAgentSnapshot[]

    expect(resolveValidCanvasArrangementItemKeys(arrangement, graph, agents)).toEqual([
      'workflow:terminal-a,terminal-b',
      'terminal:terminal-d',
      'combination:group-1',
      'agent:agent-1'
    ])
  })
})
