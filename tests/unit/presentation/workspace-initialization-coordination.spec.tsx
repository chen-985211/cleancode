import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { useWorkspaceInitialization } from '../../../src/presentation/app-shell/coordinators/useWorkspaceInitialization'
import { createWorkbenchNodeStore } from '../../../src/presentation/app-shell/workbench/nodes/workbenchNodeStore'
import { WorkspaceInitialization } from '../../../src/contexts/project/domain/aggregates/WorkspaceInitialization'
import type { WorkspaceInitializationResult } from '../../../src/contexts/project/application/dto/WorkspaceInitializationDetails'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types/workbenchSnapshot'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('workspace initialization coordination', () => {
  afterEach(() => {
    Object.defineProperty(window, 'cleancode', { configurable: true, value: undefined })
  })

  it('creates directly with the latest project settings while their save is pending', async () => {
    const f = fixture()
    const create = vi.fn(async () => ({ ...f.workbench, initialization: null }))
    let finishSave!: () => void
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve
        })
    )
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: {
        applyWorkspaceInitialization: vi.fn(),
        getWorkspaceDefaults: vi.fn(async () => ({ templates: [], agents: [] })),
        listBlockTemplates: vi.fn(async () => []),
        discoverCreatableAgentProviders: vi.fn(async () => [
          { descriptor: { id: 'test-agent', displayName: 'Test Agent', icon: null } }
        ]),
        getAgentProviderPreferences: vi.fn(async () => ({ disabledProviderIds: [] })),
        listWorkspaceInitializations: vi.fn(async () => []),
        saveWorkspaceDefaults: save
      }
    })
    const { result } = renderController(f.workbench, create)
    render(result.current.renderSettings([f.workbench], vi.fn()))
    fireEvent.click(await screen.findByRole('button', { name: '添加 Agent' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Test Agent' }))
    await waitFor(() => expect(save).toHaveBeenCalledOnce())
    await act(async () => {
      expect(await result.current.createBranchWorkspace(f.workbench, 'feature')).toBe(true)
    })
    expect(create).toHaveBeenCalledWith(f.workbench, 'feature', {
      requestId: expect.any(String),
      defaults: { templates: [], agents: [{ providerId: 'test-agent', count: 1 }] }
    })
    await act(async () => finishSave())
  })

  it('keeps an empty canvas free of defaults configuration prompts', () => {
    const f = fixture()
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: { applyWorkspaceInitialization: vi.fn() }
    })
    const { result } = renderController({ ...f.workbench, initialization: null }, vi.fn())
    render(result.current.canvasControls)
    expect(screen.queryByText('空白画布')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '配置默认内容' })).not.toBeInTheDocument()
  })

  it('does not apply unfinished contents on mount, workspace changes, or a newly empty graph', () => {
    const f = fixture()
    const apply = vi.fn()
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: { applyWorkspaceInitialization: apply }
    })
    const { result } = renderController(f.workbench, vi.fn())
    act(() =>
      result.current.setWorkbench({ ...f.workbench, graph: { ...f.workbench.graph, blocks: [] } })
    )
    act(() => result.current.setWorkbench(createWorkbenchSnapshot('/other', 'Other')))
    act(() => result.current.setWorkbench(f.workbench))
    expect(apply).not.toHaveBeenCalled()
  })

  it('reuses the creation request after a failure and applies only after the explicit successful result', async () => {
    const f = fixture()
    const create = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(f.workbench)
    const apply = vi.fn(async () => f.completed)
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: {
        applyWorkspaceInitialization: apply,
        listWorkspaceInitializations: vi.fn(async () => [f.details])
      }
    })
    const { result } = renderController(f.workbench, create)
    await act(async () => {
      expect(await result.current.createBranchWorkspace(f.workbench, 'feature')).toBe(false)
    })
    expect(apply).not.toHaveBeenCalled()
    await act(async () => {
      expect(await result.current.createBranchWorkspace(f.workbench, 'feature')).toBe(true)
    })
    expect(create.mock.calls[0][2].requestId).toBe(create.mock.calls[1][2].requestId)
    expect(apply).toHaveBeenCalledOnce()
  })

  it('does not replace a newly selected workspace with a late initialization response', async () => {
    const f = fixture()
    let finish: (result: WorkspaceInitializationResult) => void = () => undefined
    const apply = vi.fn(
      () =>
        new Promise<WorkspaceInitializationResult>((resolve) => {
          finish = resolve
        })
    )
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: {
        applyWorkspaceInitialization: apply,
        listWorkspaceInitializations: vi.fn(async () => [f.details])
      }
    })
    const { result } = renderController(
      f.workbench,
      vi.fn(async () => f.workbench)
    )
    let completion!: Promise<boolean>
    act(() => {
      completion = result.current.createBranchWorkspace(f.workbench, 'feature')
    })
    await waitFor(() => expect(apply).toHaveBeenCalledOnce())
    const other = createWorkbenchSnapshot('/other', 'Other')
    act(() => result.current.setWorkbench(other))
    await act(async () => {
      finish(f.completed)
      await completion
    })
    expect(result.current.workbench).toBe(other)
  })
})

function fixture() {
  const base = createWorkbenchSnapshot('/project', 'Project')
  const operation = WorkspaceInitialization.create({
    id: 'operation',
    projectId: base.project.id,
    projectDirectory: base.project.directory,
    workspaceId: base.graph.workspaceId,
    workspaceDirectory: base.project.directory,
    branchName: 'feature',
    mode: 'new-workspace',
    defaults: { templates: [], agents: [{ providerId: 'provider', count: 1 }] }
  })
  operation.activate()
  const workbench = {
    ...base,
    graph: { ...base.graph, blocks: [], terminalGroups: [] },
    agents: [],
    initialization: operation.toSnapshot()
  }
  return {
    workbench,
    details: { initialization: operation.toSnapshot(), templates: [] },
    completed: {
      initialization: { ...operation.toSnapshot(), stage: 'complete' as const, items: [] },
      graph: workbench.graph,
      agents: []
    }
  }
}
function renderController(
  initial: WorkbenchSnapshot,
  createWorkspace: Parameters<typeof useWorkspaceInitialization>[0]['createWorkspace']
) {
  const nodeStore = createWorkbenchNodeStore()
  return renderHook(() => {
    const [workbench, setWorkbench] = useState<WorkbenchSnapshot | null>(initial)
    const [workbenches, setWorkbenches] = useState([initial])
    const controller = useWorkspaceInitialization({
      currentWorkbench: workbench,
      createWorkspace,
      nodeStore,
      protectedNodeIds: new Set(),
      reactFlowInstanceRef: { current: null },
      setCurrentWorkbench: setWorkbench,
      setWorkbenches
    })
    return { ...controller, workbench, setWorkbench, workbenches }
  })
}
