import { act, render, waitFor } from '@testing-library/react'
import { useEffect, useState } from 'react'

import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import type {
  WorkbenchFlowNode,
  WorkbenchSnapshot
} from '../../../src/presentation/app-shell/types'
import { useWorkbenchFlowNodes } from '../../../src/presentation/app-shell/useWorkbenchFlowNodes'
import { createWorkbenchNodeStore } from '../../../src/presentation/app-shell/workbenchNodeStore'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('workbench flow node presence lifecycle', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
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
    { id: 'terminal-1', remove: (controls: HarnessControls) => controls.removeTerminal() },
    { id: 'agent:agent-1', remove: (controls: HarnessControls) => controls.removeAgent() }
  ])('retains $id only until its delete presentation completes', async ({ id, remove }) => {
    const onReady = vi.fn<(controls: HarnessControls) => void>()
    render(<Harness onReady={onReady} />)

    await waitFor(() => expect(onReady).toHaveBeenCalled())
    const controls = onReady.mock.calls.at(-1)![0]
    await waitFor(() => expect(controls.getNodes().some((node) => node.id === id)).toBe(true))

    act(() => remove(controls))

    let exitingNode: WorkbenchFlowNode | undefined
    await waitFor(() => {
      exitingNode = controls.getNodes().find((node) => node.id === id)
      expect(exitingNode?.data.objectMotion?.kind).toBe('delete')
      expect(exitingNode?.draggable).toBe(false)
      expect(exitingNode?.selectable).toBe(false)
    })

    act(() => exitingNode?.data.onObjectMotionComplete?.(exitingNode.data.objectMotion!.id))

    await waitFor(() => expect(controls.getNodes().some((node) => node.id === id)).toBe(false))
  })
})

interface HarnessControls {
  readonly getNodes: () => WorkbenchFlowNode[]
  readonly removeAgent: () => void
  readonly removeTerminal: () => void
}

function Harness({ onReady }: { readonly onReady: (controls: HarnessControls) => void }) {
  const [graph, setGraph] = useState(initialGraph)
  const [workbench, setWorkbench] = useState(initialWorkbench)
  const [nodeStore] = useState(() => createWorkbenchNodeStore())

  useWorkbenchFlowNodes({
    agentToolApprovals,
    currentWorkbench: workbench,
    currentWorkspace,
    graph,
    handlers: terminalHandlers,
    hoveredTerminalBlockId: null,
    editingTerminalGroupId: null,
    isTerminalGroupSelectionMode: false,
    onAgentGraphUpdated: noop,
    onMcpCapabilityChange: noopOptionalAsync,
    onRemoveAgent: noopAsync,
    onRenameAgent: noopAsync,
    onResizeAgent: noopAsync,
    onSelectAgent: noop,
    protectedLayoutNodeIds: emptySet,
    selectedAgentId: null,
    selectedTerminalBlockIds: emptyIds,
    selectedTerminalGroupId: null,
    selectedUngroupedTerminalBlockIds: emptyIds,
    setNodes: nodeStore.setNodes,
    terminalStates: {}
  })

  useEffect(
    () =>
      onReady({
        getNodes: nodeStore.getNodes,
        removeAgent: () => setWorkbench((current) => ({ ...current, agents: [] })),
        removeTerminal: () => setGraph((current) => ({ ...current, blocks: [] }))
      }),
    [nodeStore.getNodes, onReady]
  )

  return null
}

const initialGraph: BlockGraphSnapshot = {
  blocks: [
    {
      description: '',
      id: 'terminal-1',
      launchCommand: '',
      name: 'Terminal 1',
      position: { x: 80, y: 80 },
      size: { width: 420, height: 306 },
      type: 'terminal'
    }
  ],
  id: 'graph-alpha-project',
  projectId: 'project-alpha-project',
  terminalGroups: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  workspaceId: 'main'
}

const initialWorkbench: WorkbenchSnapshot = {
  ...createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project'),
  agents: [
    {
      agentId: 'agent-1',
      cleancodeMcpEnabled: true,
      layout: {
        position: { x: 40, y: 40 },
        size: { width: 560, height: 520 }
      },
      name: 'Agent 1',
      projectId: 'project-alpha-project',
      providerId: 'codex',
      workspaceId: 'main'
    }
  ],
  graph: initialGraph
}
const currentWorkspace = initialWorkbench.project.workspaces[0]!
const terminalHandlers = {} as never
const emptyIds: readonly string[] = []
const emptySet = new Set<string>()
const agentToolApprovals = {
  approvals: [],
  approve: noopAsync,
  clearForAgent: noop,
  dismiss: noop,
  locate: noop,
  reject: noopAsync
}

function noop(): void {}
async function noopAsync(): Promise<void> {}
async function noopOptionalAsync(): Promise<undefined> {
  return undefined
}
