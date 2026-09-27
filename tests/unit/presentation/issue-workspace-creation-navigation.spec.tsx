import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { useProjectWorkspaceLifecycle } from '../../../src/presentation/app-shell/coordinators/useProjectWorkspaceLifecycle'
import { createWorkbenchNodeStore } from '../../../src/presentation/app-shell/workbench/nodes/workbenchNodeStore'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types/workbenchSnapshot'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('issue creation while defaults are saving', () => {
  afterEach(() => {
    delete window.cleancode
  })

  it.each(['unchanged', 'current-workspace', 'other-project'] as const)(
    'respects the %s navigation intent from before the defaults save completes',
    async (selection) => {
      const origin = createWorkbenchSnapshot('/project', 'project')
      const other = createWorkbenchSnapshot('/other', 'other')
      const workspace = {
        workspaceId: 'issue-workspace',
        workspaceKind: 'linked-worktree' as const,
        displayName: 'issue/42',
        gitBranch: 'issue/42',
        directory: '/issue',
        isCurrent: true,
        issue: { id: 'I_42', repository: 'owner/repo', number: 42, title: 'Task', url: '' }
      }
      const created = {
        ...origin,
        project: {
          ...origin.project,
          workspaces: [
            ...origin.project.workspaces.map((item) => ({ ...item, isCurrent: false })),
            workspace
          ]
        },
        graph: { ...origin.graph, workspaceId: workspace.workspaceId },
        initialization: null
      }
      let finishSave!: () => void
      const save = vi.fn(
        () =>
          new Promise((resolve) => {
            finishSave = () =>
              resolve({
                defaults: { templates: [], agents: [{ providerId: 'test-agent', count: 1 }] },
                removedTemplateIds: []
              })
          })
      )
      const start = vi.fn(async () => created)
      const switchWorkspace = vi.fn(async ({ projectDirectory }: { projectDirectory: string }) =>
        projectDirectory === other.project.directory ? other : created
      )
      window.cleancode = {
        startIssueWorkspace: start,
        switchBranchWorkspace: switchWorkspace,
        applyWorkspaceInitialization: vi.fn(),
        getWorkspaceDefaults: async () => ({
          defaults: { templates: [], agents: [] },
          removedTemplateIds: []
        }),
        listBlockTemplates: async () => [],
        discoverCreatableAgentProviders: async () => [
          { descriptor: { id: 'test-agent', displayName: 'Test Agent', icon: null } }
        ],
        getAgentProviderPreferences: async () => ({ disabledProviderIds: [] }),
        listWorkspaceInitializations: async () => [],
        saveWorkspaceDefaults: save
      } as unknown as NonNullable<Window['cleancode']>
      const nodeStore = createWorkbenchNodeStore()
      const { result } = renderHook(() => {
        const [current, setCurrentWorkbench] = useState<WorkbenchSnapshot | null>(origin)
        const [workbenches, setWorkbenches] = useState([origin, other])
        const controller = useProjectWorkspaceLifecycle({
          currentWorkbench: current,
          setCurrentWorkbench,
          setWorkbenches,
          replaceWorkbench: (value) => {
            setCurrentWorkbench(value)
            setWorkbenches((items) =>
              items.map((item) => (item.project.id === value.project.id ? value : item))
            )
          },
          notifications: { notify: vi.fn(() => ''), update: vi.fn(() => false), dismiss: vi.fn() },
          nodeStore,
          protectedNodeIds: new Set(),
          reactFlowInstanceRef: { current: null },
          setHoveredTerminalBlockId: vi.fn(),
          setSelectedTerminalBlockId: vi.fn(),
          terminateWorkspaceTerminalSessions: vi.fn(),
          forgetWorkspaceTerminalStates: vi.fn()
        })
        return { ...controller, current, workbenches }
      })
      render(result.current.workspaceInitialization.renderSettings([origin], vi.fn()))
      fireEvent.click(await screen.findByRole('button', { name: '添加 Agent' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Test Agent' }))
      await waitFor(() => expect(save).toHaveBeenCalledOnce())

      let pending!: Promise<boolean>
      act(() => {
        pending = result.current.workspaceInitialization.createIssueWorkspace(origin, {
          projectDirectory: origin.project.directory,
          repository: 'owner/repo',
          number: 42,
          branchName: 'issue/42',
          baseBranch: 'main'
        })
      })
      expect(start).not.toHaveBeenCalled()
      const target = selection === 'other-project' ? other : origin
      if (selection !== 'unchanged') {
        await act(() =>
          result.current.branchWorkspaceActions.selectWorkspace(target, target.graph.workspaceId)
        )
      }
      await act(async () => {
        finishSave()
        expect(await pending).toBe(true)
      })

      const expected = selection === 'unchanged' ? created : target
      expect(result.current.current?.project.id).toBe(expected.project.id)
      expect(result.current.current?.graph.workspaceId).toBe(expected.graph.workspaceId)
      expect(start).toHaveBeenCalledOnce()
      expect(switchWorkspace).toHaveBeenCalledTimes(selection === 'current-workspace' ? 0 : 1)
      expect(
        result.current.workbenches
          .find((item) => item.project.id === origin.project.id)
          ?.project.workspaces.find((item) => item.workspaceId === workspace.workspaceId)?.issue
      ).toEqual(workspace.issue)
    }
  )
})
