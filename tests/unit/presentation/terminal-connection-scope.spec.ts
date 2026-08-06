import {
  isTerminalConnectionAllowedInCanvasScope,
  isTerminalConnectionEditableInCanvasScope
} from '../../../src/presentation/app-shell/terminalConnectionScope'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types'

describe('terminal connection canvas scope', () => {
  const graph = {
    blocks: ['root-a', 'root-b', 'inside-a', 'inside-b'].map((id) => ({ id })),
    terminalGroups: [{ id: 'development', memberBlockIds: ['inside-a', 'inside-b'] }]
  } as unknown as WorkbenchSnapshot['graph']

  it('allows only endpoints in the same root or combination scope', () => {
    expect(isTerminalConnectionAllowedInCanvasScope(graph, 'root-a', 'root-b', null)).toBe(true)
    expect(isTerminalConnectionAllowedInCanvasScope(graph, 'inside-a', 'inside-b', null)).toBe(true)
    expect(isTerminalConnectionAllowedInCanvasScope(graph, 'root-a', 'inside-a', null)).toBe(false)
  })

  it('focuses connection creation and deletion on the combination being edited', () => {
    expect(
      isTerminalConnectionAllowedInCanvasScope(graph, 'inside-a', 'inside-b', 'development')
    ).toBe(true)
    expect(isTerminalConnectionAllowedInCanvasScope(graph, 'root-a', 'root-b', 'development')).toBe(
      false
    )
    expect(
      isTerminalConnectionEditableInCanvasScope(graph, 'inside-a', 'inside-b', 'development')
    ).toBe(true)
    expect(
      isTerminalConnectionEditableInCanvasScope(graph, 'root-a', 'root-b', 'development')
    ).toBe(false)
  })
})
