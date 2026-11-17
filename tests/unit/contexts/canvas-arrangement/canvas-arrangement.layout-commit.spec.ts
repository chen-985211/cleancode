import {
  CommitCanvasLayoutUseCase,
  type CommitCanvasLayoutCommand
} from '../../../../src/contexts/canvas-arrangement/application/use-cases/CommitCanvasLayoutUseCase'
import type { CanvasLayoutCommitPort } from '../../../../src/contexts/canvas-arrangement/application/ports/CanvasLayoutCommitPort'

describe('canvas layout commit', () => {
  it.each(['create-stack', 'move-stack'] as const)('commits positions before %s', async (type) => {
    const { port, events } = createPort()
    const stack = layoutCommand().relation.stacks[0]!
    const command = { ...layoutCommand(), relation: { type, stack } }
    await new CommitCanvasLayoutUseCase(port).execute(command)
    expect(events).toEqual(['move:10', `${type}:${stack.id}`])
  })

  it.each(['create-stack', 'move-stack'] as const)(
    'retains the original and compensation errors after %s fails',
    async (type) => {
      const { port } = createPort()
      const failure = new Error('relation failed')
      const rollback = new Error('position compensation failed')
      port.createStack.mockRejectedValue(failure)
      port.moveStack.mockRejectedValue(failure)
      port.moveObjects.mockResolvedValueOnce(undefined).mockRejectedValueOnce(rollback)
      const stack = layoutCommand().relation.stacks[0]!
      const command = { ...layoutCommand(), relation: { type, stack } }
      await expect(new CommitCanvasLayoutUseCase(port).execute(command)).rejects.toMatchObject({
        errors: [failure, rollback]
      })
      expect(port.moveObjects).toHaveBeenLastCalledWith(command.previousPositions)
    }
  )

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
    expect(port.restoreStack).toHaveBeenCalledWith(command.relation.stacks[0])
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
    createStack: vi.fn(async (stack: { readonly id: string }) => {
      events.push(`create-stack:${stack.id}`)
    }),
    moveStack: vi.fn(async (stack: { readonly id: string }) => {
      events.push(`move-stack:${stack.id}`)
    }),
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

function layoutCommand(): CommitCanvasLayoutCommand & {
  readonly relation: Extract<CommitCanvasLayoutCommand['relation'], { type: 'remove-stacks' }>
} {
  return {
    positions: [{ reference: { kind: 'terminal', terminalId: 'a' }, position: { x: 10, y: 20 } }],
    previousPositions: [
      { reference: { kind: 'terminal', terminalId: 'a' }, position: { x: 1, y: 2 } }
    ],
    relation: {
      type: 'remove-stacks',
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
}
