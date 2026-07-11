import { fireEvent, render, screen } from '@testing-library/react'

import { CanvasMinimap } from '../../../src/presentation/app-shell/CanvasMinimap'
import type { MinimapNodeInteractionContextValue } from '../../../src/presentation/app-shell/minimapInteraction'
import type { AgentConsoleFlowNode } from '../../../src/presentation/app-shell/types'

describe('Agent minimap navigation', () => {
  it('renders a neutral content-free Agent node and routes activation', () => {
    const onMinimapNodeClick = vi.fn()
    const { container } = render(
      <CanvasMinimap
        isCollapsed={false}
        nodes={[createAgentConsoleFlowNode()]}
        canvasViewport={{ x: 0, y: 0, zoom: 1 }}
        canvasSize={{ width: 960, height: 640 }}
        viewportZoom={1}
        minimapNodeInteraction={createMinimapNodeInteraction()}
        onToggleCollapsed={vi.fn()}
        onZoomOut={vi.fn()}
        onZoomIn={vi.fn()}
        onFitCanvas={vi.fn()}
        onMinimapNodeClick={onMinimapNodeClick}
        onViewportCenterPreview={vi.fn()}
        onViewportCenterCommit={vi.fn()}
        getMiniMapNodeColor={() => 'var(--cc-muted)'}
        getMiniMapNodeStrokeColor={() => 'var(--cc-border-strong)'}
        getMiniMapNodeClassName={() => 'canvas-minimap__node--agent-console'}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '聚焦 Agent Codex CLI' }))

    expect(container.querySelector('.canvas-minimap__node--agent-console')).toBeInTheDocument()
    expect(container.querySelector('.canvas-minimap__agent-header')).toHaveAttribute(
      'fill',
      'var(--cc-muted)'
    )
    expect(container.querySelector('.canvas-minimap__agent-body')).toBeInTheDocument()
    expect(container.querySelector('.canvas-minimap__node-screen')).not.toBeInTheDocument()
    expect(onMinimapNodeClick).toHaveBeenCalledWith('agent-console')
  })
})

function createMinimapNodeInteraction(): MinimapNodeInteractionContextValue {
  return {
    getLabel: () => 'Codex CLI',
    setHoveredBlockId: vi.fn()
  }
}

function createAgentConsoleFlowNode(): AgentConsoleFlowNode {
  return {
    id: 'agent-console',
    type: 'agentConsole',
    position: { x: 540, y: 120 },
    selected: false,
    style: { width: 440, height: 520 },
    data: {
      currentWorkbench: null,
      currentWorkspace: null,
      onGraphUpdated: vi.fn()
    }
  }
}
