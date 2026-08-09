import { filterMinimapNodes } from '../../../src/presentation/app-shell/minimapInteraction'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'

describe('minimap interaction', () => {
  it('omits terminal surfaces parked by a collapsed group', () => {
    const visible = createTerminalNode('visible')
    const parked = {
      ...createTerminalNode('parked'),
      data: { isParkedInCollapsedGroup: true }
    } as WorkbenchFlowNode

    expect(filterMinimapNodes([visible, parked]).map((node) => node.id)).toEqual(['visible'])
  })
})

function createTerminalNode(id: string): WorkbenchFlowNode {
  return {
    data: {},
    id,
    position: { x: 0, y: 0 },
    type: 'terminal'
  } as unknown as WorkbenchFlowNode
}
