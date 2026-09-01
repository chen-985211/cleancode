import type { CanvasArrangementSnapshot } from '../../../../src/contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import {
  canvasArrangementItemKey,
  findCanvasArrangementStack,
  isCanvasArrangementSelectionModifier,
  normalizeCanvasArrangementSelectionRect,
  resolveCanvasArrangementSelectionFromCandidates,
  type CanvasArrangementSelectionItem
} from '../../../../src/contexts/canvas-arrangement/presentation/view-models/canvasArrangementSelection'

describe('canvas arrangement selection presentation', () => {
  it('uses the platform selection modifier and normalizes reverse marquee input', () => {
    expect(isCanvasArrangementSelectionModifier({ ctrlKey: false, metaKey: true }, 'mac')).toBe(
      true
    )
    expect(isCanvasArrangementSelectionModifier({ ctrlKey: true, metaKey: false }, 'mac')).toBe(
      false
    )
    expect(isCanvasArrangementSelectionModifier({ ctrlKey: true, metaKey: false }, 'other')).toBe(
      true
    )
    expect(normalizeCanvasArrangementSelectionRect({ x: 40, y: 60 }, { x: 10, y: 20 })).toEqual({
      height: 40,
      width: 30,
      x: 10,
      y: 20
    })
  })

  it('expands a marquee hit to the complete stack and resolves that exact stack', () => {
    const arrangement: CanvasArrangementSnapshot = {
      projectId: 'project-1',
      workspaceId: 'main',
      stacks: [
        {
          anchor: { x: 0, y: 0 },
          id: 'stack-1',
          items: [
            { kind: 'terminal', terminalId: 'terminal-1' },
            { kind: 'agent', agentId: 'agent-1' }
          ]
        }
      ]
    }
    const candidates = [
      item({ kind: 'terminal', terminalId: 'terminal-1' }, 0, 0),
      item({ kind: 'agent', agentId: 'agent-1' }, 200, 200),
      item({ kind: 'terminal', terminalId: 'terminal-2' }, 400, 400)
    ]

    const selected = resolveCanvasArrangementSelectionFromCandidates({
      arrangement,
      candidates,
      selection: { height: 30, width: 30, x: 10, y: 10 }
    })

    expect(selected.map((candidate) => candidate.key)).toEqual([
      'terminal:terminal-1',
      'agent:agent-1'
    ])
    expect(findCanvasArrangementStack(arrangement, selected)?.id).toBe('stack-1')
  })
})

function item(
  reference: CanvasArrangementSelectionItem['reference'],
  x: number,
  y: number
): CanvasArrangementSelectionItem {
  return {
    key: canvasArrangementItemKey(reference),
    nodeIds: [canvasArrangementItemKey(reference)],
    position: { x, y },
    reference,
    size: { height: 100, width: 100 }
  }
}
