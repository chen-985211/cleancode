import { act, render } from '@testing-library/react'

import type { CanvasArrangementSnapshot } from '../../../src/contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import { WorkbenchCanvasBottomControls } from '../../../src/presentation/app-shell/WorkbenchCanvasBottomControls'
import type { CanvasArrangementSelection } from '../../../src/presentation/app-shell/canvasArrangementSelection'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('workbench canvas bottom controls', () => {
  it('moves the current bottom control down before the requested control rises', () => {
    const motion = installAnimationFrameController()
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
    motion.flush()
    let quickExecution = document.querySelector<HTMLElement>('[data-quick-execution-bar]')!

    expect(quickExecution).not.toHaveAttribute('inert')
    expect(document.querySelector('[data-canvas-arrangement-toolbar]')).toBeNull()

    rerender(<WorkbenchCanvasBottomControls {...props} selection={emptyMarqueeSelection()} />)

    expect(quickExecution).not.toHaveAttribute('inert')
    expect(document.querySelector('[data-canvas-arrangement-toolbar]')).toBeNull()

    rerender(<WorkbenchCanvasBottomControls {...props} selection={singleItemMarqueeSelection()} />)

    expect(quickExecution).toHaveAttribute('inert')
    expect(document.querySelector('[data-canvas-arrangement-toolbar]')).toBeNull()

    rerender(<WorkbenchCanvasBottomControls {...props} selection={emptyMarqueeSelection()} />)

    expect(document.querySelector('[data-quick-execution-bar]')).toBe(quickExecution)
    expect(quickExecution).not.toHaveAttribute('inert')
    expect(document.querySelector('[data-canvas-arrangement-toolbar]')).toBeNull()

    motion.flush()

    expect(document.querySelector('[data-quick-execution-bar]')).toBe(quickExecution)
    expect(document.querySelector('[data-canvas-arrangement-toolbar]')).toBeNull()

    rerender(<WorkbenchCanvasBottomControls {...props} selection={singleItemMarqueeSelection()} />)

    expect(quickExecution).toHaveAttribute('inert')
    expect(document.querySelector('[data-canvas-arrangement-toolbar]')).toBeNull()

    motion.flush()
    let arrangementToolbar = document.querySelector<HTMLElement>(
      '[data-canvas-arrangement-toolbar]'
    )!

    expect(document.querySelector('[data-quick-execution-bar]')).toBeNull()
    expect(arrangementToolbar).not.toHaveAttribute('inert')
    expect(arrangementToolbar.querySelectorAll('button:disabled')).toHaveLength(2)

    rerender(<WorkbenchCanvasBottomControls {...props} selection={singleItemReleasedSelection()} />)

    expect(document.querySelector('[data-quick-execution-bar]')).toBeNull()
    expect(document.querySelector('[data-canvas-arrangement-toolbar]')).toBe(arrangementToolbar)
    expect(arrangementToolbar.querySelectorAll('button:disabled')).toHaveLength(2)

    rerender(<WorkbenchCanvasBottomControls {...props} selection={emptyMarqueeSelection()} />)

    expect(arrangementToolbar).toHaveAttribute('inert')
    expect(document.querySelector('[data-quick-execution-bar]')).toBeNull()

    motion.flush()
    quickExecution = document.querySelector<HTMLElement>('[data-quick-execution-bar]')!

    expect(document.querySelector('[data-canvas-arrangement-toolbar]')).toBeNull()
    expect(quickExecution).not.toHaveAttribute('inert')

    rerender(<WorkbenchCanvasBottomControls {...props} selection={marqueeSelection()} />)

    expect(quickExecution).toHaveAttribute('inert')
    expect(document.querySelector('[data-canvas-arrangement-toolbar]')).toBeNull()

    motion.flush()
    arrangementToolbar = document.querySelector<HTMLElement>('[data-canvas-arrangement-toolbar]')!

    expect(document.querySelector('[data-quick-execution-bar]')).toBeNull()
    expect(arrangementToolbar).not.toHaveAttribute('inert')
    expect(arrangementToolbar.querySelectorAll('button:disabled')).toHaveLength(2)

    rerender(<WorkbenchCanvasBottomControls {...props} selection={releasedSelection()} />)

    expect(document.querySelector('[data-quick-execution-bar]')).toBeNull()
    expect(arrangementToolbar).not.toHaveAttribute('inert')
    expect(arrangementToolbar.querySelectorAll('button:disabled')).toHaveLength(0)
    expect(arrangementToolbar.querySelector('[aria-label="解除所选对象吸附"]')).toBeInTheDocument()

    rerender(<WorkbenchCanvasBottomControls {...props} selection={null} />)

    expect(arrangementToolbar).toHaveAttribute('inert')
    expect(arrangementToolbar.querySelector('[aria-label="解除所选对象吸附"]')).toBeInTheDocument()

    motion.flush()

    expect(document.querySelector('[data-canvas-arrangement-toolbar]')).toBeNull()
    expect(document.querySelector('[data-quick-execution-bar]')).not.toHaveAttribute('inert')
  })
})

function installAnimationFrameController(): { readonly flush: () => void } {
  let currentTime = 0
  let nextFrameId = 1
  const callbacks = new Map<number, FrameRequestCallback>()

  vi.spyOn(window.performance, 'now').mockImplementation(() => currentTime)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const frameId = nextFrameId
    nextFrameId += 1
    callbacks.set(frameId, callback)
    return frameId
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
    callbacks.delete(frameId)
  })

  return {
    flush: () => {
      for (let frame = 0; frame < 240 && callbacks.size > 0; frame += 1) {
        act(() => {
          currentTime += 1000 / 60
          const currentCallbacks = [...callbacks.values()]
          callbacks.clear()
          currentCallbacks.forEach((callback) => callback(currentTime))
        })
      }
    }
  }
}

function emptyMarqueeSelection(): CanvasArrangementSelection {
  return { items: [], rect: { height: 20, width: 20, x: 0, y: 0 } }
}

function singleItemMarqueeSelection(): CanvasArrangementSelection {
  return { items: selectionItems().slice(0, 1), rect: { height: 80, width: 100, x: 0, y: 0 } }
}

function singleItemReleasedSelection(): CanvasArrangementSelection {
  return { items: selectionItems().slice(0, 1), rect: null }
}

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
