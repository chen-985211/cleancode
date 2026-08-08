import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'

import type {
  BlockTemplateSnapshot,
  InstantiatedBlockTemplateSnapshot
} from '../../../src/contexts/block-graph/application/dto/BlockTemplateSnapshot'
import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalWorkflowPlanScope } from '../../../src/contexts/run/application/ports/TerminalWorkflowPlanPort'
import { ignoreAppNotifications } from '../../../src/presentation/app-shell/appNotifications'
import { I18nProvider } from '../../../src/presentation/app-shell/i18n/I18nProvider'
import { useBlockTemplateActions } from '../../../src/presentation/app-shell/useBlockTemplateActions'
import { createWorkbenchNodeStore } from '../../../src/presentation/app-shell/workbenchNodeStore'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('block template actions', () => {
  it('retains the save presentation until its controlled exit completes', () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app')
    const { result } = renderActions(workbench)

    act(() => result.current.requestSave(['terminal-a']))
    expect(result.current.savePresentation).toMatchObject({
      open: true,
      projectDirectory: '/repo/app',
      selectedBlockIds: ['terminal-a']
    })

    act(() => result.current.closeSave())
    expect(result.current.savePresentation).toMatchObject({
      open: false,
      selectedBlockIds: ['terminal-a']
    })

    act(() => result.current.completeSaveExit())
    expect(result.current.savePresentation).toBeNull()
  })

  it('submits only one atomic instantiation while placement is pending', async () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app')
    const pending = createDeferred<InstantiateResult>()
    const instantiateBlockTemplate = vi.fn(() => pending.promise)
    installTemplateRuntime({ instantiateBlockTemplate })
    const { result } = renderActions(workbench)

    act(() => result.current.beginPlacement(createTemplate(), false))
    let firstPlacement!: Promise<void>
    let secondPlacement!: Promise<void>
    act(() => {
      firstPlacement = result.current.place({ x: 400, y: 300 })
      secondPlacement = result.current.place({ x: 400, y: 300 })
    })

    expect(instantiateBlockTemplate).toHaveBeenCalledOnce()

    await act(async () => {
      pending.resolve(createInstantiationResult(workbench.graph))
      await Promise.all([firstPlacement, secondPlacement])
    })
  })

  it('ignores a completed placement after the user switches workspaces', async () => {
    const sourceWorkbench = createWorkbenchSnapshot('/repo/app', 'app')
    const targetWorkbench = createWorkbenchSnapshot('/repo/other', 'other')
    const pending = createDeferred<InstantiateResult>()
    installTemplateRuntime({ instantiateBlockTemplate: vi.fn(() => pending.promise) })
    const setCurrentGraph = vi.fn()
    const startScope = vi.fn(async () => undefined)
    const { result, rerender } = renderActions(sourceWorkbench, { setCurrentGraph, startScope })

    act(() => result.current.beginPlacement(createTemplate(), true))
    let placement!: Promise<void>
    act(() => {
      placement = result.current.place({ x: 400, y: 300 })
    })

    rerender({ workbench: targetWorkbench })
    await act(async () => {
      pending.resolve(createInstantiationResult(sourceWorkbench.graph))
      await placement
    })

    expect(setCurrentGraph).not.toHaveBeenCalled()
    expect(startScope).not.toHaveBeenCalled()
  })
})

interface InstantiateResult {
  readonly graph: BlockGraphSnapshot
  readonly instance: InstantiatedBlockTemplateSnapshot
  readonly template: BlockTemplateSnapshot
}

function renderActions(
  initialWorkbench: ReturnType<typeof createWorkbenchSnapshot>,
  overrides: {
    readonly setCurrentGraph?: (graph: BlockGraphSnapshot) => void
    readonly startScope?: (scope: TerminalWorkflowPlanScope) => Promise<void>
  } = {}
) {
  const nodeStore = createWorkbenchNodeStore()
  const setCurrentGraph = overrides.setCurrentGraph ?? vi.fn()
  const startScope = overrides.startScope ?? vi.fn(async () => undefined)

  return renderHook(
    ({ workbench }) =>
      useBlockTemplateActions({
        currentWorkbench: workbench,
        currentWorkspace: workbench.project.workspaces.find((workspace) => workspace.isCurrent),
        nodeStore,
        notifications: ignoreAppNotifications,
        protectedNodeIds: new Set(),
        reactFlowInstanceRef: { current: null },
        setCurrentGraph,
        terminalWorkflow: { startScope }
      }),
    {
      initialProps: { workbench: initialWorkbench },
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <I18nProvider initialLocale="zh-CN">{children}</I18nProvider>
      )
    }
  )
}

function installTemplateRuntime({
  instantiateBlockTemplate
}: {
  readonly instantiateBlockTemplate: () => Promise<InstantiateResult>
}): void {
  Object.defineProperty(window, 'cleancode', {
    configurable: true,
    value: { instantiateBlockTemplate }
  })
}

function createTemplate(): BlockTemplateSnapshot {
  return {
    connections: [],
    createdAt: '2026-07-30T00:00:00.000Z',
    description: '',
    id: 'template-1',
    name: 'API',
    nodes: [
      {
        description: '',
        executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
        launchCommand: 'pnpm api',
        name: 'API',
        position: { x: 0, y: 0 },
        size: { height: 300, width: 420 },
        templateNodeId: 'node-1'
      }
    ],
    scope: { type: 'global' },
    type: 'terminal',
    updatedAt: '2026-07-30T00:00:00.000Z'
  }
}

function createInstantiationResult(graph: BlockGraphSnapshot): InstantiateResult {
  const blockId = 'new-block'
  return {
    graph: {
      ...graph,
      blocks: [
        {
          description: '',
          id: blockId,
          launchCommand: 'pnpm api',
          name: 'API',
          position: { x: 400, y: 300 },
          size: { height: 300, width: 420 },
          type: 'terminal'
        }
      ]
    },
    instance: {
      blockIds: [blockId],
      executionScope: { blockIds: [blockId], type: 'block-set' },
      terminalGroupId: null
    },
    template: createTemplate()
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}
