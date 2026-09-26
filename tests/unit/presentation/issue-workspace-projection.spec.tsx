import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { useProjectWorkspaceLifecycle } from '../../../src/presentation/app-shell/coordinators/useProjectWorkspaceLifecycle'
import { createWorkbenchNodeStore } from '../../../src/presentation/app-shell/workbench/nodes/workbenchNodeStore'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types/workbenchSnapshot'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('background issue workspace creation', () => {
  afterEach(() => {
    delete window.cleancode
  })

  it.each(['current-workspace', 'same-project', 'other-project'] as const)(
    'publishes the created workspace without replacing a newer %s selection or canvas',
    async (selection) => {
      const main = createWorkbenchSnapshot('/project', 'project')
      const feature = {
        workspaceId: 'feature',
        workspaceKind: 'linked-worktree' as const,
        displayName: 'feature',
        gitBranch: 'feature',
        directory: '/feature',
        isCurrent: false
      }
      const origin = {
        ...main,
        project: { ...main.project, workspaces: [...main.project.workspaces, feature] }
      }
      const sameProject = {
        ...origin,
        project: {
          ...origin.project,
          workspaces: origin.project.workspaces.map((item) => ({
            ...item,
            isCurrent: item.workspaceId === feature.workspaceId
          }))
        },
        graph: { ...origin.graph, workspaceId: feature.workspaceId }
      }
      const other = createWorkbenchSnapshot('/other', 'other')
      const target =
        selection === 'current-workspace'
          ? origin
          : selection === 'same-project'
            ? sameProject
            : other
      const issue = { id: 'I_42', repository: 'owner/repo', number: 42, title: 'Task', url: '' }
      const workspace = {
        workspaceId: 'issue-workspace',
        workspaceKind: 'linked-worktree' as const,
        displayName: 'issue/42',
        gitBranch: 'issue/42',
        directory: '/task',
        isCurrent: true,
        issue
      }
      const created: WorkbenchSnapshot = {
        ...origin,
        project: {
          ...origin.project,
          workspaces: [
            ...origin.project.workspaces.map((item) => ({ ...item, isCurrent: false })),
            workspace
          ]
        },
        graph: { ...origin.graph, workspaceId: workspace.workspaceId },
        gitBranches: [
          {
            name: workspace.gitBranch,
            isCurrent: true,
            isMainWorkspaceBranch: false,
            worktreeDirectory: workspace.directory,
            isSelectableInMainWorkspace: false,
            isLocked: false,
            lockReason: null
          }
        ]
      }
      let finish!: (value: WorkbenchSnapshot) => void
      const creation = new Promise<WorkbenchSnapshot>((resolve) => {
        finish = resolve
      })
      window.cleancode = {
        startIssueWorkspace: () => creation,
        switchBranchWorkspace: async () => target,
        synchronizeProjectGitState: async () => null
      } as unknown as NonNullable<Window['cleancode']>
      const nodeStore = createWorkbenchNodeStore()
      const { result } = renderHook(() => {
        const [current, setCurrentWorkbench] = useState<WorkbenchSnapshot | null>(origin)
        const [workbenches, setWorkbenches] = useState([origin, other])
        const replaceWorkbench = (value: WorkbenchSnapshot) => {
          setCurrentWorkbench(value)
          setWorkbenches((items) =>
            items.map((item) => (item.project.id === value.project.id ? value : item))
          )
        }
        const controller = useProjectWorkspaceLifecycle({
          currentWorkbench: current,
          setCurrentWorkbench,
          setWorkbenches,
          replaceWorkbench,
          notifications: { notify: vi.fn(() => ''), update: vi.fn(() => false), dismiss: vi.fn() },
          nodeStore,
          protectedNodeIds: new Set(),
          reactFlowInstanceRef: { current: null },
          setHoveredTerminalBlockId: vi.fn(),
          setSelectedTerminalBlockId: vi.fn(),
          terminateWorkspaceTerminalSessions: vi.fn(),
          forgetWorkspaceTerminalStates: vi.fn()
        })
        return { ...controller, current, workbenches, replaceWorkbench }
      })
      let pending!: Promise<WorkbenchSnapshot | undefined>
      act(() => {
        pending = result.current.branchWorkspaceActions.createBranchWorkspace(origin, 'issue/42', {
          requestId: 'request',
          issueCommand: {
            projectDirectory: '/project',
            repository: 'owner/repo',
            number: 42,
            branchName: 'issue/42',
            baseBranch: 'main'
          }
        })
      })
      await act(() =>
        result.current.branchWorkspaceActions.selectWorkspace(target, target.graph.workspaceId)
      )
      act(() =>
        result.current.replaceWorkbench({
          ...target,
          project: { ...target.project, issueRepository: 'new/source' },
          graph: { ...target.graph, viewport: { x: 20, y: 30, zoom: 0.8 } },
          agents: []
        })
      )
      const visible = result.current.current!
      const cached = result.current.workbenches.find(
        (item) => item.project.id === origin.project.id
      )!
      await act(async () => {
        finish(created)
        await pending
      })
      const updated = result.current.workbenches.find(
        (item) => item.project.id === origin.project.id
      )!
      expect(updated.project.workspaces).toContainEqual({ ...workspace, isCurrent: false })
      expect(result.current.current?.graph).toBe(visible.graph)
      expect(result.current.current?.project.id).toBe(visible.project.id)
      expect(result.current.current?.project.issueRepository).toBe('new/source')
      expect(result.current.current?.agents).toBe(visible.agents)
      expect(updated.graph).toBe(cached.graph)
      expect(updated.gitBranches).toContainEqual({ ...created.gitBranches[0], isCurrent: false })
      if (selection !== 'other-project') {
        expect(result.current.current?.project.workspaces).toContainEqual({
          ...workspace,
          isCurrent: false
        })
      }
      expect(
        updated.project.workspaces.filter((item) => item.isCurrent).map((item) => item.workspaceId)
      ).toEqual([cached.graph.workspaceId])
    }
  )
})
