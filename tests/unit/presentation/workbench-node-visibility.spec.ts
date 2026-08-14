import { isWorkbenchNodePresentationHidden } from '../../../src/presentation/app-shell/workbenchNodeVisibility'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'

describe('workbench node presentation visibility', () => {
  it('keeps staged objects out of navigation until their atomic entrance begins', () => {
    expect(isWorkbenchNodePresentationHidden(createTerminal('pending'))).toBe(true)
    expect(isWorkbenchNodePresentationHidden(createTerminal('entering'))).toBe(false)
  })
})

function createTerminal(phase: 'pending' | 'entering'): WorkbenchFlowNode {
  return {
    data: {
      block: { id: 'terminal-1', size: { height: 306, width: 420 } },
      objectPresence: { id: 'operation-1:terminal-1', phase }
    },
    id: 'terminal-1',
    position: { x: 320, y: 240 },
    type: 'terminal'
  } as unknown as WorkbenchFlowNode
}
