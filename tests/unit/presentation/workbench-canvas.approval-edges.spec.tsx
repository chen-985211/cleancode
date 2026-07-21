import { act, render } from '@testing-library/react'
import type { Edge } from '@xyflow/react'
import type * as ReactFlowModule from '@xyflow/react'
import type { ReactNode } from 'react'

import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { useTerminalWorkflow } from '../../../src/presentation/app-shell/useTerminalWorkflow'
import { WorkbenchCanvas } from '../../../src/presentation/app-shell/WorkbenchCanvas'
import type { AgentToolApprovalViewState } from '../../../src/presentation/app-shell/agentToolApprovalTypes'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'
import { createWorkbenchNodeStore } from '../../../src/presentation/app-shell/workbenchNodeStore'

const reactFlowProps = vi.hoisted(() => ({ latest: null as MockReactFlowProps | null }))

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactFlowModule>()
  const React = await import('react')

  return {
    ...actual,
    Background: () => null,
    Panel: ({ children }: { readonly children?: ReactNode }) =>
      React.createElement('div', null, children),
    ReactFlow: (props: MockReactFlowProps) => {
      reactFlowProps.latest = props
      return React.createElement('div', null, props.children)
    }
  }
})

describe('workbench canvas Agent approval edges', () => {
  it('wires a collapsed connection proxy and excludes it from persistent edge deletion', () => {
    const deleteEdges = vi.fn(async () => undefined)
    const workflow = createWorkflow(deleteEdges)
    const workbench = {
      ...createWorkbenchSnapshot('/repo/app', 'app'),
      graph
    }

    render(
      <WorkbenchCanvas
        shortcutTooltips={{
          openSettings: '打开设置 (⌘,)',
          toggleSidebar: '切换侧边栏 (⌘B)',
          addProject: '添加项目 (⌘O)',
          createBranchWorkspace: '新建分支工作区 (⌘N)',
          previousWorkspace: '上一个工作区 (⌘⇧↑)',
          nextWorkspace: '下一个工作区 (⌘⇧↓)',
          createTerminal: '新建终端积木 (⌘T)',
          createAgent: '新建 Agent (⌘⇧A)',
          groupTerminals: '组合终端 (⌘G)',
          selectCanvasNodeLeft: '选择左侧节点 (⌘←)',
          selectCanvasNodeRight: '选择右侧节点 (⌘→)',
          selectCanvasNodeUp: '选择上方节点 (⌘↑)',
          selectCanvasNodeDown: '选择下方节点 (⌘↓)',
          zoomCanvasIn: '放大画布 (⌘=)',
          zoomCanvasOut: '缩小画布 (⌘-)',
          fitCanvas: '适应画布 (⌘0)',
          toggleMinimap: '收起或展开小地图 (⌘⇧M)'
        }}
        approvalIntents={[approval]}
        canBeginTerminalGroupSelection={false}
        canCreateTerminalGroup={false}
        currentWorkbench={workbench}
        currentWorkspace={workbench.project.workspaces[0]}
        getMiniMapNodeClassName={() => ''}
        getMiniMapNodeColor={() => '#fff'}
        getMiniMapNodeStrokeColor={() => '#000'}
        isDesktopRuntime={true}
        isMinimapCollapsed={false}
        isTerminalGroupSelectionMode={false}
        minimapNodeInteraction={{ getLabel: (id) => id, setHoveredBlockId: vi.fn() }}
        nodeStore={createWorkbenchNodeStore()}
        nodeTypes={{}}
        onBeginTerminalGroupSelection={vi.fn()}
        onCancelTerminalGroupSelection={vi.fn()}
        onCreateTerminalBlock={vi.fn()}
        onCreateTerminalGroup={vi.fn()}
        onCreateWorkspaceAgent={vi.fn()}
        onZoomCanvasIn={vi.fn()}
        onZoomCanvasOut={vi.fn()}
        onFitCanvas={vi.fn()}
        onMinimapNodeClick={vi.fn()}
        onToggleMinimap={vi.fn()}
        onNodeClick={vi.fn()}
        onNodeDrag={vi.fn()}
        onNodeDragStart={vi.fn()}
        onNodeDragStop={vi.fn()}
        onNodesChange={vi.fn()}
        onPaneClick={vi.fn()}
        onViewportChange={vi.fn()}
        reactFlowInstanceRef={{ current: null }}
        selectedTerminalGroupCandidateCount={0}
        terminalWorkflow={workflow}
      />
    )

    const proxy = reactFlowProps.latest?.edges.find((edge) => edge.id.startsWith('approval:'))
    expect(proxy).toMatchObject({
      deletable: false,
      id: 'approval:connection:approval-connection-1',
      source: 'group-source',
      sourceHandle: 'agent-approval-connection-source',
      target: 'group-target',
      targetHandle: 'agent-approval-connection-target'
    })

    act(() => {
      reactFlowProps.latest?.onEdgesDelete?.([
        proxy as Edge,
        { id: 'connection-persistent', source: 'terminal-a', target: 'terminal-b' }
      ])
    })
    expect(deleteEdges).toHaveBeenCalledWith([
      { id: 'connection-persistent', source: 'terminal-a', target: 'terminal-b' }
    ])
  })
})

interface MockReactFlowProps {
  readonly children?: ReactNode
  readonly edges: Edge[]
  readonly onEdgesDelete?: (edges: Edge[]) => void
}

function createWorkflow(
  deleteEdges: (edges: Edge[]) => Promise<void>
): ReturnType<typeof useTerminalWorkflow> {
  return {
    activeRootBlockIds: [],
    connect: vi.fn(async () => undefined),
    deleteEdges,
    edges: [],
    isActive: false,
    isStopping: false,
    nodeStatuses: {},
    run: null,
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    updateExecutionConfig: vi.fn(async () => undefined)
  }
}

const approval: AgentToolApprovalViewState = {
  phase: 'awaiting',
  request: {
    agentId: 'agent-1',
    approvalId: 'approval-connection-1',
    projectDirectory: '/repo/app',
    sessionId: 'session-1',
    summary: '断开终端依赖 connection-a-b',
    target: { connectionId: 'connection-a-b', kind: 'terminal_connection' },
    toolName: 'disconnect_terminal_blocks',
    workspaceName: 'main'
  }
}

const graph: BlockGraphSnapshot = {
  blocks: ['a', 'b', 'helper-a', 'helper-b'].map((suffix, index) => ({
    description: '',
    id: `terminal-${suffix}`,
    launchCommand: `run-${suffix}`,
    name: `Terminal ${suffix}`,
    position: { x: index * 440, y: 0 },
    size: { height: 260, width: 420 },
    type: 'terminal' as const
  })),
  connections: [{ id: 'connection-a-b', sourceBlockId: 'terminal-a', targetBlockId: 'terminal-b' }],
  id: 'graph-app',
  projectId: 'project-app',
  terminalGroups: [
    createGroup('group-source', ['terminal-a', 'terminal-helper-a']),
    createGroup('group-target', ['terminal-b', 'terminal-helper-b'])
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
  workspaceName: 'main'
}

function createGroup(id: string, memberBlockIds: readonly string[]) {
  return {
    id,
    isCollapsed: true,
    memberBlockIds,
    name: id,
    position: { x: 0, y: 0 },
    size: { height: 300, width: 800 },
    type: 'terminal-group' as const
  }
}
