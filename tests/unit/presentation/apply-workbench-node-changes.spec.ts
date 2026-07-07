import type { NodeChange } from '@xyflow/react'

import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { applyWorkbenchNodeChanges } from '../../../src/presentation/app-shell/applyWorkbenchNodeChanges'
import {
  createIdleTerminalState,
  type TerminalViewState,
  type WorkbenchFlowNode
} from '../../../src/presentation/app-shell/types'
import { createTerminalFlowNodes } from '../../../src/presentation/app-shell/terminalFlowNodes'

describe('workbench node changes', () => {
  it('moves terminal group members while the group node is being dragged', () => {
    const nodes = createTerminalFlowNodes({
      graph: createGraph(),
      selectedTerminalGroupId: 'development-group',
      hoveredTerminalBlockId: null,
      terminalStates: createTerminalStates(),
      handlers: createHandlers()
    })
    const changes: NodeChange<WorkbenchFlowNode>[] = [
      {
        id: 'development-group',
        type: 'position',
        position: { x: 388, y: 214 },
        dragging: true
      }
    ]

    const changedNodes = applyWorkbenchNodeChanges(changes, nodes)

    expect(changedNodes).toEqual([
      expect.objectContaining({ id: 'development-group', position: { x: 388, y: 214 } }),
      expect.objectContaining({ id: 'backend-terminal', position: { x: 420, y: 290 } }),
      expect.objectContaining({ id: 'frontend-terminal', position: { x: 920, y: 290 } })
    ])
  })
})

function createGraph(): BlockGraphSnapshot {
  return {
    id: 'graph-1',
    projectId: 'project-1',
    workspaceName: 'main',
    viewport: { x: 0, y: 0, zoom: 1 },
    blocks: [
      {
        id: 'backend-terminal',
        type: 'terminal',
        name: 'Backend',
        description: 'Runs the API server.',
        position: { x: 320, y: 240 },
        size: { width: 420, height: 306 }
      },
      {
        id: 'frontend-terminal',
        type: 'terminal',
        name: 'Frontend',
        description: 'Runs the web server.',
        position: { x: 820, y: 240 },
        size: { width: 420, height: 306 }
      }
    ],
    terminalGroups: [
      {
        id: 'development-group',
        type: 'terminal-group',
        name: '启动项目',
        position: { x: 288, y: 164 },
        size: { width: 984, height: 458 },
        isCollapsed: false,
        memberBlockIds: ['backend-terminal', 'frontend-terminal']
      }
    ]
  }
}

function createTerminalStates(): Record<string, TerminalViewState> {
  return {
    'backend-terminal': createIdleTerminalState(),
    'frontend-terminal': createIdleTerminalState()
  }
}

function createHandlers() {
  return {
    onStart: vi.fn(),
    onStop: vi.fn(),
    onRestart: vi.fn(),
    onDelete: vi.fn(),
    onUpdateMetadata: vi.fn(),
    onInput: vi.fn(),
    onResize: vi.fn(),
    onResizeBlock: vi.fn(async () => undefined),
    onToggleTerminalGroupCandidate: vi.fn()
  }
}
