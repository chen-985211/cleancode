import type { CanvasArrangementSelectionItem } from '../../../../src/contexts/canvas-arrangement/presentation/view-models/canvasArrangementSelection'
import type { WorkbenchSnapshot } from '../../../../src/presentation/app-shell/types/workbenchSnapshot'
import { commitCanvasArrangementLayout } from '../../../../src/presentation/app-shell/coordinators/commitCanvasArrangementLayout'

describe('canvas layout commit port', () => {
  it('routes every position to its owner while preserving agent dimensions and combination membership', async () => {
    const input = createInput()
    await commitCanvasArrangementLayout(input)
    expect(input.api.moveBlock).toHaveBeenCalledWith({
      projectDirectory: '/project',
      workspaceId: 'workspace',
      blockId: 'terminal',
      position: { x: 500, y: 0 }
    })
    expect(input.api.moveTerminalGroup).toHaveBeenCalledWith({
      projectDirectory: '/project',
      workspaceId: 'workspace',
      terminalGroupId: 'group',
      position: { x: 700, y: 0 }
    })
    expect(input.moveWorkspaceAgent).toHaveBeenCalledWith(
      input.workbench.agents![0],
      { x: -400, y: 0 },
      { width: 720, height: 460 }
    )
    expect(input.setCurrentGraph).toHaveBeenLastCalledWith(input.workbench.graph)
    expect(input.api.removeCanvasStack).toHaveBeenCalledWith({
      projectDirectory: '/project',
      projectId: 'project',
      workspaceId: 'workspace',
      stackId: 'stack'
    })
  })

  it('settles a slow successful write before compensating a failed peer write', async () => {
    const input = createInput()
    const failure = new Error('agent layout unavailable')
    let complete!: () => void
    input.api.moveBlock = vi
      .fn(
        () =>
          new Promise<WorkbenchSnapshot['graph']>((resolve) => {
            complete = () => resolve(input.workbench.graph)
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<WorkbenchSnapshot['graph']>((resolve) => {
            complete = () => resolve(input.workbench.graph)
          })
      )
      .mockImplementation(async () => input.workbench.graph)
    input.moveWorkspaceAgent.mockRejectedValueOnce(failure)
    const result = commitCanvasArrangementLayout(input)
    const rejection = expect(result).rejects.toBe(failure)
    await Promise.resolve()
    expect(input.api.removeCanvasStack).not.toHaveBeenCalled()
    expect(input.moveWorkspaceAgent).toHaveBeenCalledOnce()
    complete()
    await rejection
    expect(input.api.moveBlock).toHaveBeenCalledTimes(2)
    expect(input.api.moveBlock).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: { x: 20, y: 30 } })
    )
    expect(input.api.moveTerminalGroup).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: { x: 200, y: 30 } })
    )
    expect(input.moveWorkspaceAgent).toHaveBeenLastCalledWith(
      input.workbench.agents![0],
      { x: 800, y: 20 },
      { width: 720, height: 460 }
    )
  })
})

function createInput() {
  const workbench = {
    project: { id: 'project', directory: '/project' },
    graph: {
      blocks: [{ id: 'terminal', position: { x: 20, y: 30 } }],
      terminalGroups: [{ id: 'group', position: { x: 200, y: 30 }, memberBlockIds: ['member'] }]
    },
    agents: [
      {
        agentId: 'agent',
        layout: { position: { x: 800, y: 20 }, size: { width: 720, height: 460 } }
      }
    ]
  } as unknown as WorkbenchSnapshot
  const references = [
    { kind: 'terminal', terminalId: 'terminal' },
    { kind: 'combination', terminalGroupId: 'group' },
    { kind: 'agent', agentId: 'agent' }
  ] as const
  const items: CanvasArrangementSelectionItem[] = references.map((reference, index) => ({
    key: ['terminal:terminal', 'combination:group', 'agent:agent'][index]!,
    reference,
    nodeIds: [['terminal'], ['group'], ['agent:agent']][index]!,
    position: [
      { x: 20, y: 30 },
      { x: 200, y: 30 },
      { x: 800, y: 20 }
    ][index]!,
    size: { width: 100, height: 80 }
  }))
  const arrangement = {
    projectId: 'project',
    workspaceId: 'workspace',
    stacks: [{ id: 'stack', anchor: { x: 20, y: 30 }, items: references }]
  }
  const api = {
    moveBlock: vi.fn(async () => workbench.graph),
    moveTerminalGroup: vi.fn(async () => workbench.graph),
    removeCanvasStack: vi.fn(async () => ({ ...arrangement, stacks: [] })),
    createCanvasStack: vi.fn(async () => arrangement)
  }
  return {
    api: api as typeof api & NonNullable<Window['cleancode']>,
    arrangement,
    items,
    workbench,
    workspaceId: 'workspace',
    plan: {
      bounds: { x: -400, y: 0, width: 1_200, height: 460 },
      layouts: items.map((item, index) => ({
        key: item.key,
        position: { x: [500, 700, -400][index]!, y: 0 }
      })),
      nodePositionsById: new Map()
    },
    moveWorkspaceAgent: vi.fn(async () => undefined),
    setCurrentArrangement: vi.fn(),
    setCurrentGraph: vi.fn()
  }
}
