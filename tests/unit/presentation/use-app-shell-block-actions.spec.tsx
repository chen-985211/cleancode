import { act, renderHook } from '@testing-library/react'

import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { AppNotificationController } from '../../../src/presentation/shared/notifications/appNotifications'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types'
import { useAppShellBlockActions } from '../../../src/presentation/app-shell/useAppShellBlockActions'

describe('app shell terminal group creation', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', { configurable: true, value: undefined })
  })

  it.each([
    [0, '终端组合 1'],
    [1, '终端组合 2']
  ] as const)(
    'numbers a new group like a terminal when %i groups exist',
    async (groupCount, name) => {
      const currentWorkbench = createWorkbench(groupCount)
      const createTerminalGroup = vi.fn(async () => currentWorkbench.graph)
      Object.defineProperty(window, 'cleancode', {
        configurable: true,
        value: { createTerminalGroup }
      })

      const { result } = renderHook(() =>
        useAppShellBlockActions({
          currentWorkbench,
          currentWorkspace: currentWorkbench.project.workspaces[0],
          notifications: createNotifications(),
          setCurrentGraph: vi.fn(),
          terminateTerminalSession: vi.fn(async () => undefined)
        })
      )

      await act(async () => {
        await result.current.createTerminalGroup({ x: 320, y: 240 })
      })

      expect(createTerminalGroup).toHaveBeenCalledWith({
        name,
        position: { x: 320, y: 240 },
        projectDirectory: '/project',
        workspaceId: 'main'
      })
    }
  )
})

describe('app shell terminal scope removal', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', { configurable: true, value: undefined })
  })

  it('submits one direct removal per workspace while the first request is pending', async () => {
    let resolveDeletion: (graph: BlockGraphSnapshot) => void = () => undefined
    const pendingDeletion = new Promise<BlockGraphSnapshot>((resolve) => {
      resolveDeletion = resolve
    })
    const deleteTerminalScope = vi.fn(() => pendingDeletion)
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: { deleteTerminalScope }
    })
    const notifications = createNotifications()
    const setCurrentGraph = vi.fn()
    const { result } = renderHook(() =>
      useAppShellBlockActions({
        canCreateTerminalGroup: false,
        completeTerminalGroupSelection: vi.fn(),
        currentWorkbench: createWorkbench(),
        currentWorkspace: createWorkbench().project.workspaces[0],
        notifications,
        selectedUngroupedTerminalBlockIds: [],
        setCurrentGraph,
        setSelectedTerminalGroupId: vi.fn(),
        terminateTerminalSession: vi.fn(async () => undefined)
      })
    )
    const target = {
      type: 'workflow' as const,
      terminalBlockIds: ['terminal-a', 'terminal-b']
    }

    let removal: Promise<void> = Promise.resolve()
    act(() => {
      removal = result.current.deleteTerminalScope(target)
      void result.current.deleteTerminalScope(target)
    })

    expect(deleteTerminalScope).toHaveBeenCalledTimes(1)
    expect(notifications.notify).toHaveBeenCalledWith({
      isActivity: true,
      kind: 'info',
      title: '正在移除流程…'
    })

    await act(async () => {
      resolveDeletion(createWorkbench().graph)
      await removal
    })

    expect(setCurrentGraph).toHaveBeenCalledOnce()
    expect(notifications.dismiss).toHaveBeenCalledWith('notification-1')
  })

  it('replaces the pending feedback with a retained error when removal fails', async () => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: { deleteTerminalScope: vi.fn(async () => Promise.reject(new Error('failed'))) }
    })
    const notifications = createNotifications()
    const { result } = renderHook(() =>
      useAppShellBlockActions({
        canCreateTerminalGroup: false,
        completeTerminalGroupSelection: vi.fn(),
        currentWorkbench: createWorkbench(),
        currentWorkspace: createWorkbench().project.workspaces[0],
        notifications,
        selectedUngroupedTerminalBlockIds: [],
        setCurrentGraph: vi.fn(),
        setSelectedTerminalGroupId: vi.fn(),
        terminateTerminalSession: vi.fn(async () => undefined)
      })
    )

    await act(async () => {
      await result.current.deleteTerminalScope({
        type: 'combination',
        terminalGroupId: 'group-1',
        terminalBlockIds: ['terminal-a', 'terminal-b']
      })
    })

    expect(notifications.update).toHaveBeenCalledWith('notification-1', {
      kind: 'error',
      message: '未能移除选中的画布对象，请重试。',
      title: '移除失败'
    })
  })
})

function createNotifications(): AppNotificationController {
  return {
    dismiss: vi.fn(),
    notify: vi.fn(() => 'notification-1'),
    update: vi.fn(() => true)
  }
}

function createWorkbench(terminalGroupCount = 0): WorkbenchSnapshot {
  return {
    agents: [],
    gitBranches: [],
    graph: {
      id: 'graph-1',
      projectId: 'project-1',
      workspaceId: 'main',
      viewport: { x: 0, y: 0, zoom: 1 },
      blocks: [],
      connections: [],
      terminalGroups: Array.from({ length: terminalGroupCount }, (_, index) => ({
        id: `group-${index + 1}`,
        isCollapsed: false,
        memberBlockIds: [],
        name: `Existing group ${index + 1}`,
        position: { x: index * 560, y: 0 },
        size: { width: 520, height: 320 },
        type: 'terminal-group'
      }))
    },
    project: {
      id: 'project-1',
      directory: '/project',
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
