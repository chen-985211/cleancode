import { act, renderHook, waitFor } from '@testing-library/react'
import { useCallback, useState } from 'react'

import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types/workbenchSnapshot'
import { useCurrentGraphState } from '../../../src/presentation/app-shell/context-adapters/block-graph/useCurrentGraphState'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('Current graph state', () => {
  it('discards a graph update that resolves after its workspace is no longer current', async () => {
    const featureWorkbench = createWorkspaceWorkbench('feature/search', true)
    const mainWorkbench = createWorkspaceWorkbench('main', true)
    const lateFeatureGraph = {
      ...featureWorkbench.graph,
      viewport: { x: 480, y: 320, zoom: 0.8 }
    }
    const { result } = renderHook(() => useGraphStateHarness(featureWorkbench))
    const settleFeatureGraph = result.current.setCurrentGraph

    act(() => {
      result.current.switchWorkbench(mainWorkbench)
      settleFeatureGraph(lateFeatureGraph)
    })

    await waitFor(() => {
      expect(result.current.currentWorkbench).toBe(mainWorkbench)
      expect(result.current.workbenches).toEqual([mainWorkbench])
      expect(result.current.selectedTerminalBlockIds).toEqual(['main-block'])
      expect(result.current.selectedTerminalGroupId).toBe('main-group')
      expect(result.current.hoveredTerminalBlockId).toBe('main-block')
    })
  })

  it('commits a graph owned by the current workspace and reconciles its selection', async () => {
    const mainWorkbench = createWorkspaceWorkbench('main', true)
    const nextMainGraph = {
      ...mainWorkbench.graph,
      blocks: [],
      terminalGroups: [],
      viewport: { x: 240, y: 160, zoom: 0.9 }
    }
    const { result } = renderHook(() => useGraphStateHarness(mainWorkbench))

    act(() => result.current.setCurrentGraph(nextMainGraph))

    await waitFor(() => {
      expect(result.current.currentWorkbench?.graph).toEqual(nextMainGraph)
      expect(result.current.workbenches[0]?.graph).toEqual(nextMainGraph)
      expect(result.current.selectedTerminalBlockIds).toEqual([])
      expect(result.current.selectedTerminalGroupId).toBeNull()
      expect(result.current.hoveredTerminalBlockId).toBeNull()
    })
  })
})

function useGraphStateHarness(initialWorkbench: WorkbenchSnapshot) {
  const [currentWorkbench, setCurrentWorkbench] = useState<WorkbenchSnapshot | null>(
    initialWorkbench
  )
  const [workbenches, setWorkbenches] = useState<WorkbenchSnapshot[]>([initialWorkbench])
  const [selectedTerminalBlockIds, setSelectedTerminalBlockIds] = useState([
    `${initialWorkbench.graph.workspaceId}-block`
  ])
  const [selectedTerminalGroupId, setSelectedTerminalGroupId] = useState<string | null>(
    `${initialWorkbench.graph.workspaceId}-group`
  )
  const [hoveredTerminalBlockId, setHoveredTerminalBlockId] = useState<string | null>(
    `${initialWorkbench.graph.workspaceId}-block`
  )
  const setCurrentGraph = useCurrentGraphState({
    currentWorkbench,
    setCurrentWorkbench,
    setWorkbenches,
    setSelectedTerminalBlockIds,
    setSelectedTerminalGroupId,
    setHoveredTerminalBlockId
  })
  const switchWorkbench = useCallback((workbench: WorkbenchSnapshot) => {
    setCurrentWorkbench(workbench)
    setWorkbenches([workbench])
    setSelectedTerminalBlockIds([`${workbench.graph.workspaceId}-block`])
    setSelectedTerminalGroupId(`${workbench.graph.workspaceId}-group`)
    setHoveredTerminalBlockId(`${workbench.graph.workspaceId}-block`)
  }, [])

  return {
    currentWorkbench,
    workbenches,
    selectedTerminalBlockIds,
    selectedTerminalGroupId,
    hoveredTerminalBlockId,
    setCurrentGraph,
    switchWorkbench
  }
}

function createWorkspaceWorkbench(
  workspaceId: 'main' | 'feature/search',
  isCurrent: boolean
): WorkbenchSnapshot {
  const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
    workspaceId,
    workspaceDirectory:
      workspaceId === 'main' ? '/tmp/alpha-project' : '/tmp/alpha-project-feature-search',
    gitBranch: workspaceId,
    workspaces: [
      {
        workspaceId: 'main',
        workspaceKind: 'default',
        displayName: 'main',
        directory: '/tmp/alpha-project',
        gitBranch: 'main',
        isCurrent: workspaceId === 'main' && isCurrent
      },
      {
        workspaceId: 'feature/search',
        workspaceKind: 'linked-worktree',
        displayName: 'feature/search',
        directory: '/tmp/alpha-project-feature-search',
        gitBranch: 'feature/search',
        isCurrent: workspaceId === 'feature/search' && isCurrent
      }
    ]
  })

  return {
    ...workbench,
    graph: {
      ...workbench.graph,
      blocks: [
        {
          id: `${workspaceId}-block`,
          type: 'terminal',
          name: `${workspaceId} terminal`,
          description: '本地终端',
          launchCommand: '',
          position: { x: 160, y: 220 },
          size: { width: 420, height: 306 }
        }
      ],
      terminalGroups: [
        {
          id: `${workspaceId}-group`,
          type: 'terminal-group',
          name: `${workspaceId} group`,
          position: { x: 128, y: 144 },
          size: { width: 484, height: 458 },
          isCollapsed: false,
          memberBlockIds: [`${workspaceId}-block`]
        }
      ]
    }
  }
}
