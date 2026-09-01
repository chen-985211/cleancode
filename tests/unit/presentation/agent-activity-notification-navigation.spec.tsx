import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { MutableRefObject } from 'react'

import type { WorkspaceAgentSnapshot } from '../../../src/contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type {
  TerminalBlockSnapshot,
  TerminalGroupSnapshot
} from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { createCanvasObjectIdentity } from '../../../src/shared-kernel/domain/value-objects/CanvasObjectIdentity'
import type { AgentActivityNavigationRequest } from '../../../src/presentation/app-shell/types/agentActivityNavigation'
import { toAgentFlowNodeId } from '../../../src/presentation/app-shell/projections/agentConsoleFlowNode'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types/workbenchSnapshot'
import type { WorkspaceSelectionResult } from '../../../src/presentation/app-shell/coordinators/useBranchWorkspaceActions'
import { useAgentActivityNotificationNavigation } from '../../../src/presentation/app-shell/coordinators/useAgentActivityNotificationNavigation'
import {
  createWorkbenchNodeStore,
  type WorkbenchNodeStore
} from '../../../src/presentation/app-shell/workbench/nodes/workbenchNodeStore'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('Agent activity notification navigation', () => {
  it('focuses a projected managed Agent when its physical workspace is current', async () => {
    const agent = createAgent('agent-6', 'project-alpha', 'main')
    const workbench = withAgent(createWorkbenchSnapshot('/tmp/alpha', 'alpha'), agent)
    const nodeStore = createWorkbenchNodeStore([createAgentNode(agent)])
    const focusWorkbenchNode = vi.fn()
    const onHandled = vi.fn()
    const selectWorkspace = vi.fn(async (): Promise<WorkspaceSelectionResult> => 'selected')

    renderNavigation({
      currentWorkbench: workbench,
      focusWorkbenchNode,
      nodeStore,
      onHandled,
      request: createRequest('agent', 'agent-6'),
      selectWorkspace,
      workbenches: [workbench]
    })

    await waitFor(() => expect(focusWorkbenchNode).toHaveBeenCalledWith('agent:agent-6'))
    expect(onHandled).toHaveBeenCalledWith(1)
    expect(selectWorkspace).not.toHaveBeenCalled()
  })

  it('switches once, waits for the exact target projection, and then focuses it', async () => {
    const sourceWorkbench = createWorkbenchSnapshot('/tmp/source', 'source')
    const targetWorkspace = {
      directory: '/tmp/target-feature',
      displayName: 'feature/agent',
      gitBranch: 'feature/agent',
      isCurrent: false,
      workspaceId: 'feature-agent',
      workspaceKind: 'linked-worktree' as const
    }
    const rememberedTarget = createWorkbenchSnapshot('/tmp/target', 'target', {
      workspaces: [
        {
          directory: '/tmp/target',
          displayName: 'main',
          gitBranch: 'main',
          isCurrent: true,
          workspaceId: 'main',
          workspaceKind: 'default'
        },
        targetWorkspace
      ]
    })
    const targetAgent = createAgent('agent-9', 'project-target', 'feature-agent')
    const switchedTarget = withAgent(
      createWorkbenchSnapshot('/tmp/target', 'target', {
        gitBranch: 'feature/agent',
        workspaceDirectory: '/tmp/target-feature',
        workspaceId: 'feature-agent',
        workspaces: rememberedTarget.project.workspaces.map((workspace) => ({
          ...workspace,
          isCurrent: workspace.workspaceId === 'feature-agent'
        }))
      }),
      targetAgent
    )
    const nodeStore = createWorkbenchNodeStore()
    const focusWorkbenchNode = vi.fn()
    const onHandled = vi.fn()
    const selectWorkspace = vi.fn(async (): Promise<WorkspaceSelectionResult> => 'selected')
    const request = createRequest('agent', 'agent-9', {
      projectId: 'project-target',
      requestId: 2,
      workspaceId: 'feature-agent'
    })
    const { rerender } = renderNavigation({
      currentWorkbench: sourceWorkbench,
      focusWorkbenchNode,
      nodeStore,
      onHandled,
      request,
      selectWorkspace,
      workbenches: [sourceWorkbench, rememberedTarget]
    })

    await waitFor(() =>
      expect(selectWorkspace).toHaveBeenCalledWith(rememberedTarget, 'feature-agent')
    )
    rerender({
      currentWorkbench: switchedTarget,
      focusWorkbenchNode,
      nodeStore,
      onHandled,
      request,
      selectWorkspace,
      workbenches: [sourceWorkbench, switchedTarget]
    })
    expect(focusWorkbenchNode).not.toHaveBeenCalled()

    act(() =>
      nodeStore.setNodes([createAgentNode({ ...targetAgent, projectId: 'project-source' })])
    )
    expect(focusWorkbenchNode).not.toHaveBeenCalled()

    act(() => nodeStore.setNodes([createAgentNode(targetAgent)]))

    await waitFor(() => expect(focusWorkbenchNode).toHaveBeenCalledWith('agent:agent-9'))
    expect(onHandled).toHaveBeenCalledWith(2)
    expect(selectWorkspace).toHaveBeenCalledOnce()
  })

  it('ends a failed switch so it cannot steal focus if the workspace is visited later', async () => {
    const sourceWorkbench = createWorkbenchSnapshot('/tmp/source', 'source')
    const targetAgent = createAgent('agent-9', 'project-target', 'main')
    const targetWorkbench = withAgent(createWorkbenchSnapshot('/tmp/target', 'target'), targetAgent)
    const nodeStore = createWorkbenchNodeStore()
    const focusWorkbenchNode = vi.fn()
    const onHandled = vi.fn()
    const selectWorkspace = vi.fn(async (): Promise<WorkspaceSelectionResult> => 'failed')
    const request = createRequest('agent', 'agent-9', {
      projectId: 'project-target',
      workspaceId: 'main'
    })
    const { rerender } = renderNavigation({
      currentWorkbench: sourceWorkbench,
      focusWorkbenchNode,
      nodeStore,
      onHandled,
      request,
      selectWorkspace,
      workbenches: [sourceWorkbench, targetWorkbench]
    })

    await waitFor(() => expect(onHandled).toHaveBeenCalledWith(1))
    act(() => nodeStore.setNodes([createAgentNode(targetAgent)]))
    rerender({
      currentWorkbench: targetWorkbench,
      focusWorkbenchNode,
      nodeStore,
      onHandled,
      request,
      selectWorkspace,
      workbenches: [sourceWorkbench, targetWorkbench]
    })

    expect(focusWorkbenchNode).not.toHaveBeenCalled()
  })

  it('does not switch back after the user leaves a target that was waiting for projection', async () => {
    const targetAgent = createAgent('agent-9', 'project-target', 'main')
    const targetWorkbench = withAgent(createWorkbenchSnapshot('/tmp/target', 'target'), targetAgent)
    const otherWorkbench = createWorkbenchSnapshot('/tmp/other', 'other')
    const nodeStore = createWorkbenchNodeStore()
    const focusWorkbenchNode = vi.fn()
    const onHandled = vi.fn()
    const selectWorkspace = vi.fn(async (): Promise<WorkspaceSelectionResult> => 'selected')
    const request = createRequest('agent', 'agent-9', {
      projectId: 'project-target',
      workspaceId: 'main'
    })
    const { rerender } = renderNavigation({
      currentWorkbench: targetWorkbench,
      focusWorkbenchNode,
      nodeStore,
      onHandled,
      request,
      selectWorkspace,
      workbenches: [targetWorkbench, otherWorkbench]
    })

    rerender({
      currentWorkbench: otherWorkbench,
      focusWorkbenchNode,
      nodeStore,
      onHandled,
      request,
      selectWorkspace,
      workbenches: [targetWorkbench, otherWorkbench]
    })

    expect(onHandled).toHaveBeenCalledWith(1)
    expect(selectWorkspace).not.toHaveBeenCalled()
    expect(focusWorkbenchNode).not.toHaveBeenCalled()
  })

  it('focuses the physical terminal used to launch an Agent', async () => {
    const terminal = createTerminal('terminal-7')
    const workbench = withTerminal(createWorkbenchSnapshot('/tmp/alpha', 'alpha'), terminal)
    const nodeStore = createWorkbenchNodeStore([createTerminalNode(workbench, terminal)])
    const focusWorkbenchNode = vi.fn()

    renderNavigation({
      currentWorkbench: workbench,
      focusWorkbenchNode,
      nodeStore,
      request: createRequest('terminal', terminal.id),
      workbenches: [workbench]
    })

    await waitFor(() => expect(focusWorkbenchNode).toHaveBeenCalledWith('terminal-7'))
  })

  it('focuses a collapsed group when it contains the source terminal', async () => {
    const terminal = createTerminal('terminal-7')
    const group = createCollapsedGroup('group-1', terminal.id)
    const workbench = withTerminalGroup(
      withTerminal(createWorkbenchSnapshot('/tmp/alpha', 'alpha'), terminal),
      group
    )
    const nodeStore = createWorkbenchNodeStore([createGroupNode(workbench, group)])
    const focusWorkbenchNode = vi.fn()

    renderNavigation({
      currentWorkbench: workbench,
      focusWorkbenchNode,
      nodeStore,
      request: createRequest('terminal', terminal.id),
      workbenches: [workbench]
    })

    await waitFor(() => expect(focusWorkbenchNode).toHaveBeenCalledWith('group-1'))
  })
})

interface NavigationHarnessProps {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly focusWorkbenchNode: (nodeId: string) => void
  readonly nodeStore: WorkbenchNodeStore
  readonly onHandled?: (requestId: number) => void
  readonly request: AgentActivityNavigationRequest | null
  readonly selectWorkspace?: (
    workbench: WorkbenchSnapshot,
    workspaceId: string
  ) => Promise<WorkspaceSelectionResult>
  readonly workbenches: readonly WorkbenchSnapshot[]
}

function renderNavigation(initialProps: NavigationHarnessProps) {
  const reactFlowInstanceRef = createReactFlowInstanceRef(initialProps.nodeStore)
  return renderHook(
    (props: NavigationHarnessProps) =>
      useAgentActivityNotificationNavigation({
        currentWorkbench: props.currentWorkbench,
        focusWorkbenchNode: props.focusWorkbenchNode,
        nodeStore: props.nodeStore,
        onHandled: props.onHandled ?? vi.fn(),
        reactFlowInstanceRef,
        request: props.request,
        selectWorkspace:
          props.selectWorkspace ?? vi.fn(async (): Promise<WorkspaceSelectionResult> => 'selected'),
        workbenches: props.workbenches
      }),
    { initialProps }
  )
}

function createRequest(
  objectKind: 'agent' | 'terminal',
  objectId: string,
  overrides: Partial<
    Pick<AgentActivityNavigationRequest['target'], 'projectId' | 'workspaceId'> & {
      readonly requestId: number
    }
  > = {}
): AgentActivityNavigationRequest {
  return {
    requestId: overrides.requestId ?? 1,
    target: createCanvasObjectIdentity({
      objectId,
      objectKind,
      projectId: overrides.projectId ?? 'project-alpha',
      workspaceId: overrides.workspaceId ?? 'main'
    })
  }
}

function createReactFlowInstanceRef(
  nodeStore: WorkbenchNodeStore
): MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null> {
  return {
    current: {
      getNode: (nodeId: string) => nodeStore.getNodes().find((node) => node.id === nodeId)
    } as ReactFlowInstance<WorkbenchFlowNode, Edge>
  }
}

function createAgent(
  agentId: string,
  projectId: string,
  workspaceId: string
): WorkspaceAgentSnapshot {
  return {
    agentId,
    cleancodeMcpEnabled: true,
    layout: { position: { x: 400, y: 180 }, size: { height: 460, width: 720 } },
    name: agentId,
    projectId,
    providerId: 'codex',
    workspaceId
  }
}

function createTerminal(id: string): TerminalBlockSnapshot {
  return {
    description: '',
    id,
    launchCommand: '',
    name: id,
    position: { x: 180, y: 120 },
    size: { height: 320, width: 520 },
    type: 'terminal'
  }
}

function createCollapsedGroup(id: string, terminalId: string): TerminalGroupSnapshot {
  return {
    id,
    isCollapsed: true,
    memberBlockIds: [terminalId],
    name: id,
    position: { x: 120, y: 100 },
    size: { height: 360, width: 620 },
    type: 'terminal-group'
  }
}

function createAgentNode(agent: WorkspaceAgentSnapshot): WorkbenchFlowNode {
  return {
    data: {
      identity: createCanvasObjectIdentity({
        objectId: agent.agentId,
        objectKind: 'agent',
        projectId: agent.projectId,
        workspaceId: agent.workspaceId
      })
    },
    id: toAgentFlowNodeId(agent.agentId),
    position: agent.layout.position,
    type: 'agentConsole'
  } as WorkbenchFlowNode
}

function createTerminalNode(
  workbench: WorkbenchSnapshot,
  terminal: TerminalBlockSnapshot
): WorkbenchFlowNode {
  return {
    data: {
      identity: createCanvasObjectIdentity({
        objectId: terminal.id,
        objectKind: 'terminal',
        projectId: workbench.project.id,
        workspaceId: workbench.graph.workspaceId
      })
    },
    id: terminal.id,
    position: terminal.position,
    type: 'terminal'
  } as WorkbenchFlowNode
}

function createGroupNode(
  workbench: WorkbenchSnapshot,
  group: TerminalGroupSnapshot
): WorkbenchFlowNode {
  return {
    data: {
      identity: createCanvasObjectIdentity({
        objectId: group.id,
        objectKind: 'terminal-group',
        projectId: workbench.project.id,
        workspaceId: workbench.graph.workspaceId
      })
    },
    id: group.id,
    position: group.position,
    type: 'terminalGroup'
  } as WorkbenchFlowNode
}

function withAgent(workbench: WorkbenchSnapshot, agent: WorkspaceAgentSnapshot): WorkbenchSnapshot {
  return { ...workbench, agents: [agent] }
}

function withTerminal(
  workbench: WorkbenchSnapshot,
  terminal: TerminalBlockSnapshot
): WorkbenchSnapshot {
  return { ...workbench, graph: { ...workbench.graph, blocks: [terminal] } }
}

function withTerminalGroup(
  workbench: WorkbenchSnapshot,
  group: TerminalGroupSnapshot
): WorkbenchSnapshot {
  return { ...workbench, graph: { ...workbench.graph, terminalGroups: [group] } }
}
