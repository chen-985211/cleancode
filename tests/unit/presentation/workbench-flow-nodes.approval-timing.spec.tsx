import { render } from '@testing-library/react'
import { useLayoutEffect } from 'react'

import type { AgentToolApprovalViewState } from '../../../src/presentation/app-shell/agentToolApprovalTypes'
import { useWorkbenchFlowNodes } from '../../../src/presentation/app-shell/useWorkbenchFlowNodes'

describe('Workbench approval projection timing', () => {
  it('projects visible nodes before the browser layout phase can paint an approval', () => {
    const phases: string[] = []
    const { rerender } = render(<TimingProbe approvals={[]} phases={phases} />)

    phases.length = 0
    rerender(<TimingProbe approvals={[approval]} phases={phases} />)

    expect(phases.slice(0, 2)).toEqual(['flow-nodes-projected', 'layout-observed'])
  })
})

function TimingProbe({
  approvals,
  phases
}: {
  readonly approvals: readonly AgentToolApprovalViewState[]
  readonly phases: string[]
}) {
  useWorkbenchFlowNodes({
    agentToolApprovals: {
      approvals,
      approve: async () => undefined,
      clearForAgent: () => undefined,
      dismiss: () => undefined,
      locate: () => undefined,
      reject: async () => undefined
    },
    currentWorkbench: null,
    currentWorkspace: undefined,
    graph: null,
    handlers: {} as never,
    hoveredTerminalBlockId: null,
    isTerminalGroupSelectionMode: false,
    onMcpCapabilityChange: async () => undefined,
    onRemoveAgent: async () => undefined,
    onRenameAgent: async () => undefined,
    onResizeAgent: async () => undefined,
    onSelectAgent: () => undefined,
    selectedAgentId: null,
    selectedTerminalBlockIds: [],
    selectedTerminalGroupId: null,
    selectedUngroupedTerminalBlockIds: [],
    setCurrentGraph: () => undefined,
    setNodes: () => {
      phases.push('flow-nodes-projected')
    },
    terminalGroupDropAction: { type: 'none' },
    terminalStates: {}
  })

  useLayoutEffect(() => {
    phases.push('layout-observed')
  }, [approvals, phases])

  return null
}

const approval: AgentToolApprovalViewState = {
  phase: 'awaiting',
  request: {
    agentId: 'agent-1',
    approvalId: 'approval-1',
    projectDirectory: '/repo/app',
    sessionId: 'session-1',
    summary: '删除终端积木 terminal-1',
    target: { blockId: 'terminal-1', kind: 'terminal_block' },
    toolName: 'delete_block',
    workspaceName: 'main'
  }
}
