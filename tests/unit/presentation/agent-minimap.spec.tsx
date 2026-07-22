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
        shortcutTooltips={{
          fitCanvas: '适应画布 (⌘0)',
          toggleMinimap: '收起或展开小地图 (⌘⇧M)',
          zoomCanvasIn: '放大画布 (⌘=)',
          zoomCanvasOut: '缩小画布 (⌘-)'
        }}
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
      'var(--cc-border)'
    )
    expect(container.querySelector('.canvas-minimap__agent-body')).toBeInTheDocument()
    expect(container.querySelector('.canvas-minimap__node-screen')).not.toBeInTheDocument()
    expect(onMinimapNodeClick).toHaveBeenCalledWith('agent:agent-1')
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
    id: 'agent:agent-1',
    type: 'agentConsole',
    position: { x: 540, y: 120 },
    selected: false,
    style: { width: 440, height: 520 },
    data: {
      agent: {
        agentId: 'agent-1',
        cleancodeMcpEnabled: true,
        layout: { position: { x: 540, y: 120 }, size: { width: 440, height: 520 } },
        name: 'Agent 1',
        projectId: 'project-1',
        workspaceName: 'main'
      },
      currentWorkbench: null,
      currentWorkspace: null,
      onGraphUpdated: vi.fn(),
      onMcpCapabilityChange: vi.fn(async () => undefined),
      onRemove: vi.fn(async () => undefined),
      onRename: vi.fn(async () => undefined),
      onResize: vi.fn(async () => undefined)
    }
  }
}
