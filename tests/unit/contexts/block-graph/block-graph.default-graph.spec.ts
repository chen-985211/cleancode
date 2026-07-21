import {
  BlockGraph,
  defaultCanvasViewport,
  defaultTerminalBlockSize
} from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'

describe('default block graph', () => {
  it('belongs to the current project main workspace', () => {
    const graph = BlockGraph.createDefault({
      projectId: 'project-1',
      workspaceName: 'main'
    })

    expect(graph.projectId).toBe('project-1')
    expect(graph.workspaceName).toBe('main')
    expect(graph.blocks).toEqual([])
    expect(graph.toSnapshot().viewport).toEqual(defaultCanvasViewport)
  })

  it('creates, edits, moves, and deletes terminal blocks', () => {
    const graph = BlockGraph.createDefault({
      projectId: 'project-1',
      workspaceName: 'main'
    })

    const terminalBlock = graph.createTerminalBlock({
      name: 'Frontend',
      description: 'Runs the frontend dev server.',
      position: { x: 160, y: 220 }
    })
    graph.updateTerminalBlockMetadata(terminalBlock.id, {
      name: 'Frontend Server',
      description: 'Runs pnpm dev.',
      launchCommand: ' pnpm dev '
    })
    graph.moveBlock(terminalBlock.id, { x: 420, y: 260 })

    expect(graph.blocks).toEqual([
      expect.objectContaining({
        id: terminalBlock.id,
        type: 'terminal',
        name: 'Frontend Server',
        description: 'Runs pnpm dev.',
        launchCommand: 'pnpm dev',
        position: { x: 420, y: 260 },
        size: defaultTerminalBlockSize
      })
    ])

    graph.deleteBlock(terminalBlock.id)

    expect(graph.blocks).toEqual([])
  })

  it('creates terminal blocks with a spacious landscape layout', () => {
    const graph = BlockGraph.createDefault({
      projectId: 'project-1',
      workspaceName: 'main'
    })

    const terminalBlock = graph.createTerminalBlock({
      name: 'Terminal 1',
      description: '本地终端',
      position: { x: 180, y: 270 }
    })

    expect(terminalBlock.size).toEqual({ width: 720, height: 460 })
  })

  it('restores legacy terminal blocks with an empty launch command', () => {
    const graph = BlockGraph.fromSnapshot({
      id: 'legacy-graph',
      projectId: 'project-1',
      workspaceName: 'main',
      blocks: [
        {
          id: 'terminal-1',
          type: 'terminal',
          name: 'Terminal 1',
          description: '本地终端',
          position: { x: 160, y: 220 }
        }
      ]
    })

    expect(graph.toSnapshot().blocks[0]).toMatchObject({
      id: 'terminal-1',
      launchCommand: ''
    })
  })
})
