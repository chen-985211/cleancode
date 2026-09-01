import { act, renderHook } from '@testing-library/react'
import type { Edge, ReactFlowInstance } from '@xyflow/react'

import type {
  BlockGraphSnapshot,
  QuickExecutionTargetSnapshot,
  TerminalBlockSnapshot
} from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { AppNotificationController } from '../../../src/presentation/shared/notifications/appNotifications'
import { writeCanvasQuickExecutionFollowPreference } from '../../../src/presentation/app-shell/app-features/settings/canvasQuickExecutionFollowPreference'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types/workbenchSnapshot'
import { useQuickExecutionActions } from '../../../src/presentation/app-shell/coordinators/useQuickExecutionActions'

describe('quick execution actions', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    {
      target: { type: 'terminal' as const, terminalBlockId: 'terminal-1' },
      visibleNodeIds: ['terminal-1']
    },
    {
      target: {
        type: 'workflow' as const,
        terminalBlockIds: ['terminal-1', 'terminal-2']
      },
      visibleNodeIds: ['terminal-1', 'terminal-2']
    },
    {
      target: { type: 'combination' as const, terminalGroupId: 'group-1' },
      visibleNodeIds: ['group-1']
    }
  ])(
    'follows and executes a valid $target.type target when following is enabled',
    async ({ target, visibleNodeIds }) => {
      const harness = createHarness(target, true)

      await act(async () => harness.result.current.executeSlot(1))

      expect(harness.getNodesBounds).toHaveBeenCalledWith(
        visibleNodeIds.map((id) => expect.objectContaining({ id }))
      )
      expect(harness.setViewport).toHaveBeenCalledOnce()
      expectExecution(harness, target)
    }
  )

  it('executes without moving the viewport when following is disabled', async () => {
    const target = { type: 'terminal' as const, terminalBlockId: 'terminal-1' }
    const harness = createHarness(target, false)

    await act(async () => harness.result.current.executeSlot(1))

    expect(harness.setViewport).not.toHaveBeenCalled()
    expect(harness.quickLaunchTerminal).toHaveBeenCalledOnce()
  })

  it('keeps execution independent when the target cannot be focused', async () => {
    const target = { type: 'terminal' as const, terminalBlockId: 'terminal-1' }
    const harness = createHarness(target, true, { exposeNodes: false })

    await act(async () => harness.result.current.executeSlot(1))

    expect(harness.setViewport).not.toHaveBeenCalled()
    expect(harness.quickLaunchTerminal).toHaveBeenCalledOnce()
  })
})

function createHarness(
  target: QuickExecutionTargetSnapshot,
  followQuickExecutionTarget: boolean,
  { exposeNodes = true }: { readonly exposeNodes?: boolean } = {}
) {
  writeCanvasQuickExecutionFollowPreference({ followQuickExecutionTarget })
  const graph = createGraph(target)
  const nodes = [
    createNode('terminal-1', 'terminal'),
    createNode('terminal-2', 'terminal'),
    createNode('group-1', 'terminalGroup')
  ]
  const getNodesBounds = vi.fn(() => ({ height: 100, width: 120, x: 0, y: 0 }))
  const setViewport = vi.fn(async () => true)
  const instance = {
    getNode: (nodeId: string) =>
      exposeNodes ? nodes.find((candidate) => candidate.id === nodeId) : undefined,
    getNodesBounds,
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    setViewport
  } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
  const quickLaunchTerminal = vi.fn(async () => undefined)
  const requestTerminalLaunchCommand = vi.fn()
  const startScope = vi.fn(async () => undefined)
  const startTerminalCombination = vi.fn(async () => undefined)
  const currentWorkbench = createWorkbench(graph)
  const result = renderHook(() =>
    useQuickExecutionActions({
      currentWorkbench,
      currentWorkspace: currentWorkbench.project.workspaces[0],
      notifications: createNotifications(),
      quickLaunchTerminal,
      reactFlowInstanceRef: { current: instance },
      requestTerminalLaunchCommand,
      setCurrentGraph: vi.fn(),
      startScope,
      startTerminalCombination
    })
  ).result

  return {
    getNodesBounds,
    quickLaunchTerminal,
    requestTerminalLaunchCommand,
    result,
    setViewport,
    startScope,
    startTerminalCombination
  }
}

function expectExecution(
  harness: ReturnType<typeof createHarness>,
  target: QuickExecutionTargetSnapshot
): void {
  if (target.type === 'terminal') {
    expect(harness.quickLaunchTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ id: target.terminalBlockId }),
      { shouldFocus: false }
    )
    return
  }
  if (target.type === 'workflow') {
    expect(harness.startScope).toHaveBeenCalledWith({
      type: 'block-set',
      blockIds: target.terminalBlockIds
    })
    return
  }
  expect(harness.startTerminalCombination).toHaveBeenCalledWith(target.terminalGroupId)
}

function createGraph(target: QuickExecutionTargetSnapshot): BlockGraphSnapshot {
  return {
    blocks: [createBlock('terminal-1'), createBlock('terminal-2')],
    connections:
      target.type === 'workflow'
        ? [
            {
              id: 'terminal-1-before-terminal-2',
              sourceBlockId: 'terminal-1',
              targetBlockId: 'terminal-2'
            }
          ]
        : [],
    id: 'graph-1',
    projectId: 'project-1',
    quickExecutionSlots: [
      { number: 1, target },
      { number: 2, target: null },
      { number: 3, target: null },
      { number: 4, target: null },
      { number: 5, target: null }
    ],
    terminalGroups:
      target.type === 'combination'
        ? [
            {
              id: 'group-1',
              isCollapsed: false,
              memberBlockIds: ['terminal-1', 'terminal-2'],
              name: 'Group 1',
              position: { x: 0, y: 0 },
              size: { height: 600, width: 900 },
              type: 'terminal-group'
            }
          ]
        : [],
    viewport: { x: 0, y: 0, zoom: 1 },
    workspaceId: 'main'
  }
}

function createBlock(id: string): TerminalBlockSnapshot {
  return {
    description: '',
    executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
    id,
    launchCommand: `pnpm ${id}`,
    name: id,
    position: { x: 0, y: 0 },
    size: { height: 460, width: 720 },
    type: 'terminal'
  }
}

function createNode(id: string, type: 'terminal' | 'terminalGroup'): WorkbenchFlowNode {
  return { data: {}, id, position: { x: 0, y: 0 }, type } as WorkbenchFlowNode
}

function createWorkbench(graph: BlockGraphSnapshot): WorkbenchSnapshot {
  return {
    agents: [],
    gitBranches: [],
    graph,
    project: {
      directory: '/project',
      id: 'project-1',
      name: 'Project',
      workspaces: [
        {
          directory: '/project',
          displayName: 'main',
          gitBranch: null,
          isCurrent: true,
          workspaceId: 'main',
          workspaceKind: 'default'
        }
      ]
    }
  }
}

function createNotifications(): AppNotificationController {
  return {
    dismiss: vi.fn(),
    notify: vi.fn(),
    update: vi.fn()
  }
}
