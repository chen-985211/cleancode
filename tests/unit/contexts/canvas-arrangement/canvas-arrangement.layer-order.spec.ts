import { CanvasArrangement } from '../../../../src/contexts/canvas-arrangement/domain/aggregates/CanvasArrangement'
import {
  parseCanvasArrangementStore,
  serializeCanvasArrangementStore
} from '../../../../src/contexts/canvas-arrangement/infrastructure/persistence/CanvasArrangementStore'

const scope = { projectId: 'project', workspaceId: 'workspace' }
const layerOrder = [
  { kind: 'agent' as const, agentId: 'same-id' },
  { kind: 'combination' as const, terminalGroupId: 'group' },
  { kind: 'terminal' as const, terminalId: 'same-id' },
  { kind: 'terminal' as const, terminalId: 'hidden-member' }
]

describe('canvas layer order persistence', () => {
  it('round trips the bottom-to-top order, including hidden members and typed identities', () => {
    const arrangement = CanvasArrangement.fromSnapshot({ ...scope, stacks: [], layerOrder })
    const stored = serializeCanvasArrangementStore(arrangement.toSnapshot())
    expect(JSON.parse(stored).version).toBe(4)
    expect(parseCanvasArrangementStore(stored, 'store').layerOrder).toEqual(layerOrder)
    expect(arrangement.toSnapshot().layerOrder).not.toBe(layerOrder)
  })

  it('changes only ordering and leaves stack anchors and internal membership intact', () => {
    const arrangement = CanvasArrangement.fromSnapshot({ ...scope, stacks: [], layerOrder })
    const stack = arrangement.createStack({
      id: 'stack',
      anchor: { x: 10, y: 20 },
      items: [layerOrder[0]!, layerOrder[1]!]
    })
    arrangement.setLayerOrder([...layerOrder].reverse())
    expect(arrangement.toSnapshot().layerOrder).toEqual([...layerOrder].reverse())
    expect(arrangement.toSnapshot().stacks).toEqual([stack])
  })

  it('rejects duplicate identities without changing the previously saved order', () => {
    const arrangement = CanvasArrangement.fromSnapshot({ ...scope, stacks: [], layerOrder })
    expect(() => arrangement.setLayerOrder([layerOrder[0]!, layerOrder[0]!])).toThrow()
    expect(arrangement.toSnapshot().layerOrder).toEqual(layerOrder)
  })

  it('prunes deleted layer references without removing live workflow or collapsed combination members', () => {
    const arrangement = CanvasArrangement.fromSnapshot({ ...scope, stacks: [], layerOrder })
    expect(arrangement.reconcile([], ['terminal:same-id', 'terminal:hidden-member'])).toEqual({
      changed: true,
      removedStackIds: []
    })
    expect(arrangement.toSnapshot().layerOrder).toEqual(layerOrder.slice(2))
  })

  it.each([1, 2, 3])(
    'loads version %s with default ordering and writes version four on the next save',
    (version) => {
      const old = JSON.stringify({ version, arrangement: { ...scope, stacks: [] } })
      const restored = parseCanvasArrangementStore(old, 'store')
      expect(restored.layerOrder ?? []).toEqual([])
      expect(JSON.parse(serializeCanvasArrangementStore(restored))).toEqual({
        version: 4,
        arrangement: { ...scope, stacks: [], layerOrder: [] }
      })
    }
  )

  it.each([
    undefined,
    'invalid',
    [{ kind: 'terminal', terminalId: '' }],
    [{ kind: 'workflow', terminalIds: ['a', 'b'] }],
    [{ kind: 'agent', agentId: 'a', zIndex: 100 }],
    [
      { kind: 'terminal', terminalId: 'a' },
      { kind: 'terminal', terminalId: 'a' }
    ]
  ])('rejects malformed saved order instead of silently resetting it: %j', (invalid) => {
    expect(() =>
      parseCanvasArrangementStore(
        JSON.stringify({
          version: 4,
          arrangement: { ...scope, stacks: [], layerOrder: invalid }
        }),
        'store'
      )
    ).toThrow('Persisted canvas arrangement is corrupted.')
  })
})
