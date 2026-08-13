import { render } from '@testing-library/react'

import type { CanvasArrangementSnapshot } from '../../../src/contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import { WorkbenchCanvasBottomControls } from '../../../src/presentation/app-shell/WorkbenchCanvasBottomControls'
import type { CanvasArrangementSelection } from '../../../src/presentation/app-shell/canvasArrangementSelection'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('workbench canvas bottom controls', () => {
  it('hands off between quick execution and arrangement without removing either live surface', () => {
    const workbench = createWorkbenchSnapshot('/project', 'project')
    const arrangement: CanvasArrangementSnapshot = {
      projectId: workbench.project.id,
      stacks: [
        {
          anchor: { x: 0, y: 0 },
          id: 'stack-1',
          items: [
            { kind: 'terminal', terminalId: 'terminal-1' },
            { kind: 'terminal', terminalId: 'terminal-2' }
          ]
        }
      ],
      workspaceId: workbench.graph.workspaceId
    }
    const props = {
      arrangement,
      currentWorkbench: workbench,
      isArrangementPending: false,
      isQuickExecutionDropTarget: false,
      onAddQuickExecutionTarget: vi.fn(),
      onArrange: vi.fn(),
      onBindQuickExecutionSlot: vi.fn(),
      onClearQuickExecutionSlot: vi.fn(),
      onReorderQuickExecutionSlots: vi.fn(),
      reactFlowInstanceRef: { current: null },
      shortcutPlatform: 'mac' as const,
      shortcutTooltips: {}
    }
    const { rerender } = render(<WorkbenchCanvasBottomControls {...props} selection={null} />)
    const quickExecution = document.querySelector<HTMLElement>('[data-quick-execution-bar]')!

    expect(quickExecution).not.toHaveAttribute('inert')
    expect(document.querySelector('[data-canvas-arrangement-toolbar]')).toBeNull()

    rerender(<WorkbenchCanvasBottomControls {...props} selection={marqueeSelection()} />)

    expect(document.querySelector('[data-quick-execution-bar]')).toBe(quickExecution)
    expect(quickExecution).toHaveAttribute('inert')
    expect(document.querySelector('[data-canvas-arrangement-toolbar]')).toBeNull()

    rerender(<WorkbenchCanvasBottomControls {...props} selection={releasedSelection()} />)
    const arrangementToolbar = document.querySelector<HTMLElement>(
      '[data-canvas-arrangement-toolbar]'
    )!

    expect(document.querySelector('[data-quick-execution-bar]')).toBe(quickExecution)
    expect(quickExecution).toHaveAttribute('inert')
    expect(arrangementToolbar).not.toHaveAttribute('inert')
    expect(arrangementToolbar.querySelector('[aria-label="解除所选对象吸附"]')).toBeInTheDocument()

    rerender(<WorkbenchCanvasBottomControls {...props} selection={null} />)

    expect(document.querySelector('[data-quick-execution-bar]')).toBe(quickExecution)
    expect(quickExecution).not.toHaveAttribute('inert')
    expect(document.querySelector('[data-canvas-arrangement-toolbar]')).toBe(arrangementToolbar)
    expect(arrangementToolbar).toHaveAttribute('inert')
    expect(arrangementToolbar.querySelector('[aria-label="解除所选对象吸附"]')).toBeInTheDocument()
  })
})

function marqueeSelection(): CanvasArrangementSelection {
  return { items: selectionItems(), rect: { height: 200, width: 300, x: 0, y: 0 } }
}

function releasedSelection(): CanvasArrangementSelection {
  return { items: selectionItems(), rect: null }
}

function selectionItems(): CanvasArrangementSelection['items'] {
  return ['terminal-1', 'terminal-2'].map((terminalId, index) => ({
    key: `terminal:${terminalId}`,
    nodeIds: [terminalId],
    position: { x: index * 120, y: 0 },
    reference: { kind: 'terminal' as const, terminalId },
    size: { height: 80, width: 100 }
  }))
}
