import {
  CommitCanvasLayoutUseCase,
  type CommitCanvasLayoutCommand
} from '../../../../src/contexts/canvas-arrangement/application/use-cases/CommitCanvasLayoutUseCase'
import type { CanvasLayoutCommitPort } from '../../../../src/contexts/canvas-arrangement/application/ports/CanvasLayoutCommitPort'

describe('canvas layout commit', () => {
  it('commits positions before removing every affected stack', async () => {
    const { port, events } = createPort()
    const command = layoutCommand()
    await new CommitCanvasLayoutUseCase(port).execute(command)
    expect(events).toEqual(['move:10', 'remove:first', 'remove:second'])
    expect(port.moveObjects).toHaveBeenCalledWith(command.positions)
    expect(port.restoreStack).not.toHaveBeenCalled()
  })

  it('restores exact member coordinates and already removed relations after a later failure', async () => {
    const { port, events } = createPort()
    const failure = new Error('remove failed')
    port.removeStack.mockImplementation(async (stack) => {
      events.push(`remove:${stack.id}`)
      if (stack.id === 'second') throw failure
    })
    const command = layoutCommand()
    await expect(new CommitCanvasLayoutUseCase(port).execute(command)).rejects.toBe(failure)
    expect(events).toEqual(['move:10', 'remove:first', 'remove:second', 'move:1', 'restore:first'])
    expect(port.moveObjects).toHaveBeenLastCalledWith(command.previousPositions)
    expect(port.restoreStack).toHaveBeenCalledWith(command.stacks[0])
  })

  it('continues relation compensation when restoring positions also fails', async () => {
    const { port, events } = createPort()
    const removalFailure = new Error('remove failed')
    const rollbackFailure = new Error('rollback failed')
    port.removeStack.mockImplementation(async (stack) => {
      if (stack.id === 'second') throw removalFailure
    })
    port.moveObjects.mockImplementation(async (positions) => {
      if (positions[0]!.position.x === 1) throw rollbackFailure
    })
    await expect(
      new CommitCanvasLayoutUseCase(port).execute(layoutCommand())
    ).rejects.toMatchObject({
      errors: [removalFailure, rollbackFailure]
    })
    expect(events).toEqual(['restore:first'])
  })
})

function createPort() {
  const events: string[] = []
  const port = {
    moveObjects: vi.fn<CanvasLayoutCommitPort['moveObjects']>(async (positions) => {
      events.push(`move:${positions[0]!.position.x}`)
    }),
    removeStack: vi.fn<CanvasLayoutCommitPort['removeStack']>(async (stack) => {
      events.push(`remove:${stack.id}`)
    }),
    restoreStack: vi.fn<CanvasLayoutCommitPort['restoreStack']>(async (stack) => {
      events.push(`restore:${stack.id}`)
    })
  }
  return { port, events }
}

function layoutCommand(): CommitCanvasLayoutCommand {
  return {
    positions: [{ reference: { kind: 'terminal', terminalId: 'a' }, position: { x: 10, y: 20 } }],
    previousPositions: [
      { reference: { kind: 'terminal', terminalId: 'a' }, position: { x: 1, y: 2 } }
    ],
    stacks: ['first', 'second'].map((id) => ({
      id,
      anchor: { x: 1, y: 2 },
      items: [
        { kind: 'terminal', terminalId: `${id}-a` },
        { kind: 'agent', agentId: `${id}-b` }
      ]
    }))
  }
}
