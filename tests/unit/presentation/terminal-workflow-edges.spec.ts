import { createTerminalWorkflowEdges } from '../../../src/presentation/app-shell/terminalWorkflowEdges'
import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { projectTerminalWorkflowBuildOntoEdges } from '../../../src/presentation/app-shell/terminalWorkflowBuildEdgePresentation'

describe('terminal workflow edges', () => {
  it('maps persistent connections and hides edges of collapsed group members', () => {
    const graph = {
      id: 'graph-1',
      projectId: 'project-1',
      workspaceId: 'main',
      viewport: { x: 0, y: 0, zoom: 1 },
      blocks: [],
      connections: [
        { id: 'a-b', sourceBlockId: 'a', targetBlockId: 'b' },
        { id: 'b-c', sourceBlockId: 'b', targetBlockId: 'c' }
      ],
      terminalGroups: [
        {
          id: 'group-1',
          type: 'terminal-group',
          name: 'Group',
          position: { x: 0, y: 0 },
          size: { width: 800, height: 500 },
          isCollapsed: true,
          memberBlockIds: ['c', 'd']
        }
      ]
    } satisfies BlockGraphSnapshot

    expect(createTerminalWorkflowEdges(graph, { b: 'running' })).toEqual([
      expect.objectContaining({
        id: 'a-b',
        source: 'a',
        target: 'b',
        className: 'terminal-workflow-edge terminal-workflow-edge--active',
        style: { stroke: 'var(--cc-primary)' },
        markerEnd: expect.objectContaining({ color: 'var(--cc-primary)' })
      })
    ])
  })

  it('keeps dependencies of expanded group members above the group shell', () => {
    const graph = {
      id: 'graph-1',
      projectId: 'project-1',
      workspaceId: 'main',
      viewport: { x: 0, y: 0, zoom: 1 },
      blocks: [],
      connections: [
        { id: 'a-b', sourceBlockId: 'a', targetBlockId: 'b' },
        { id: 'c-d', sourceBlockId: 'c', targetBlockId: 'd' }
      ],
      terminalGroups: [
        {
          id: 'group-1',
          type: 'terminal-group',
          name: 'Group',
          position: { x: 0, y: 0 },
          size: { width: 800, height: 500 },
          isCollapsed: false,
          memberBlockIds: ['a', 'b']
        }
      ]
    } satisfies BlockGraphSnapshot

    const edges = createTerminalWorkflowEdges(graph, {})

    expect(edges.find((edge) => edge.id === 'a-b')).toMatchObject({ zIndex: 3 })
    expect(edges.find((edge) => edge.id === 'c-d')?.zIndex).toBeUndefined()
  })

  it('keeps committed connections hidden until their dependency layer begins', () => {
    const edges = [
      { id: 'a-b', source: 'a', target: 'b', className: 'terminal-workflow-edge' },
      { id: 'b-c', source: 'b', target: 'c', className: 'terminal-workflow-edge' }
    ]
    const projected = projectTerminalWorkflowBuildOntoEdges(edges, {
      enteringConnectionIds: new Set(['a-b']),
      enteringTerminalBlockIds: new Set(['a', 'b']),
      enteringTerminalGroupIds: new Set(),
      operationId: 'operation-1',
      pendingConnectionIds: new Set(['b-c']),
      pendingTerminalBlockIds: new Set(['c']),
      pendingTerminalGroupIds: new Set(),
      terminalBlockIds: new Set(['a', 'b', 'c']),
      terminalGroupIds: new Set()
    })

    expect(projected[0]?.className).toContain('workbench-object-edge--create')
    expect(projected[1]?.className).toContain('workbench-object-edge--presence-pending')
  })
})
