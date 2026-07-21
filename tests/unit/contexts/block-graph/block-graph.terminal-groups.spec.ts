import {
  BlockGraph,
  defaultTerminalGroupSize
} from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'

describe('terminal groups in the default block graph', () => {
  it('binds multiple terminals into a persistent terminal group', () => {
    const graph = BlockGraph.createDefault({
      projectId: 'project-1',
      workspaceName: 'main'
    })
    const backend = graph.createTerminalBlock({
      id: 'backend-terminal',
      name: 'Backend',
      description: 'Runs the API server.',
      position: { x: 320, y: 240 }
    })
    const frontend = graph.createTerminalBlock({
      id: 'frontend-terminal',
      name: 'Frontend',
      description: 'Runs the web server.',
      position: { x: 820, y: 240 }
    })

    const terminalGroup = graph.createTerminalGroup({
      id: 'development-group',
      name: '启动项目',
      memberBlockIds: [backend.id, frontend.id]
    })

    expect(graph.toSnapshot().terminalGroups).toEqual([
      {
        id: 'development-group',
        type: 'terminal-group',
        name: '启动项目',
        position: { x: 288, y: 164 },
        size: { width: 1284, height: 612 },
        isCollapsed: false,
        memberBlockIds: [backend.id, frontend.id]
      }
    ])
    expect(terminalGroup.size).not.toEqual(defaultTerminalGroupSize)
  })

  it('moves grouped terminals together when the group moves', () => {
    const graph = createGraphWithGroupedTerminals()

    graph.moveTerminalGroup('development-group', { x: 400, y: 300 })

    expect(graph.toSnapshot().terminalGroups[0]).toMatchObject({
      position: { x: 400, y: 300 }
    })
    expect(graph.toSnapshot().blocks).toEqual([
      expect.objectContaining({ id: 'backend-terminal', position: { x: 432, y: 376 } }),
      expect.objectContaining({ id: 'frontend-terminal', position: { x: 932, y: 376 } })
    ])
  })

  it('keeps terminal groups valid when members are edited or deleted', () => {
    const graph = createGraphWithGroupedTerminals()
    const worker = graph.createTerminalBlock({
      id: 'worker-terminal',
      name: 'Worker',
      description: 'Runs background jobs.',
      position: { x: 320, y: 700 }
    })

    graph.updateTerminalGroupMetadata('development-group', { name: '开发环境' })
    graph.setTerminalGroupCollapsed('development-group', true)
    graph.addTerminalToGroup('development-group', worker.id)
    graph.removeTerminalFromGroup('development-group', 'frontend-terminal')

    expect(graph.toSnapshot().terminalGroups).toEqual([
      expect.objectContaining({
        id: 'development-group',
        name: '开发环境',
        isCollapsed: true,
        memberBlockIds: ['backend-terminal', worker.id]
      })
    ])

    graph.deleteBlock(worker.id)

    expect(graph.toSnapshot().terminalGroups).toEqual([])
    expect(graph.toSnapshot().blocks.map((block) => block.id)).toEqual([
      'backend-terminal',
      'frontend-terminal'
    ])
  })

  it('restores legacy graphs and drops invalid restored groups', () => {
    const graph = BlockGraph.fromSnapshot({
      id: 'graph-1',
      projectId: 'project-1',
      workspaceName: 'main',
      blocks: [
        {
          id: 'backend-terminal',
          type: 'terminal',
          name: 'Backend',
          description: 'Runs the API server.',
          position: { x: 320, y: 240 }
        },
        {
          id: 'frontend-terminal',
          type: 'terminal',
          name: 'Frontend',
          description: 'Runs the web server.',
          position: { x: 820, y: 240 }
        }
      ],
      terminalGroups: [
        {
          id: 'valid-group',
          type: 'terminal-group',
          name: '开发环境',
          position: { x: 288, y: 184 },
          size: { width: 984, height: 418 },
          isCollapsed: false,
          memberBlockIds: ['backend-terminal', 'frontend-terminal']
        },
        {
          id: 'dangling-group',
          type: 'terminal-group',
          name: 'Invalid',
          position: { x: 0, y: 0 },
          size: defaultTerminalGroupSize,
          isCollapsed: false,
          memberBlockIds: ['backend-terminal', 'missing-terminal']
        }
      ]
    } as never)

    expect(graph.toSnapshot().terminalGroups).toEqual([
      expect.objectContaining({
        id: 'valid-group',
        memberBlockIds: ['backend-terminal', 'frontend-terminal']
      })
    ])
  })

  it('rejects ambiguous terminal group membership', () => {
    const graph = createGraphWithGroupedTerminals()

    expect(() =>
      graph.createTerminalGroup({
        name: 'Duplicate',
        memberBlockIds: ['backend-terminal', 'frontend-terminal']
      })
    ).toThrow('Terminal block already belongs to a group.')
    expect(() =>
      graph.createTerminalGroup({
        name: 'Single',
        memberBlockIds: ['backend-terminal']
      })
    ).toThrow('Terminal group must contain at least two terminals.')
  })
})

function createGraphWithGroupedTerminals(): BlockGraph {
  const graph = BlockGraph.createDefault({
    projectId: 'project-1',
    workspaceName: 'main'
  })

  graph.createTerminalBlock({
    id: 'backend-terminal',
    name: 'Backend',
    description: 'Runs the API server.',
    position: { x: 320, y: 240 }
  })
  graph.createTerminalBlock({
    id: 'frontend-terminal',
    name: 'Frontend',
    description: 'Runs the web server.',
    position: { x: 820, y: 240 }
  })
  graph.createTerminalGroup({
    id: 'development-group',
    name: '启动项目',
    memberBlockIds: ['backend-terminal', 'frontend-terminal']
  })

  return graph
}
