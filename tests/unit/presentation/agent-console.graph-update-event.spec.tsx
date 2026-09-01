import { act, render, waitFor } from '@testing-library/react'

import type { AgentGraphUpdatedEvent } from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import { AgentConsole } from '../../../src/presentation/app-shell/workbench/nodes/agent/AgentConsole'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

describe('Agent console graph update event', () => {
  it('forwards the full Agent event so layout metadata remains available to the canvas', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const currentWorkspace = workbench.project.workspaces[0]
    const onGraphUpdated = vi.fn()
    let graphListener: ((event: AgentGraphUpdatedEvent) => void) | undefined
    const runtimeApi = createRuntimeApi({
      onAgentGraphUpdated: vi.fn((listener: (event: AgentGraphUpdatedEvent) => void) => {
        graphListener = listener
        return vi.fn()
      })
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(
      <AgentConsole
        currentWorkbench={workbench}
        currentWorkspace={currentWorkspace}
        onGraphUpdated={onGraphUpdated}
      />
    )

    await waitFor(() => expect(graphListener).toBeDefined())

    const event: AgentGraphUpdatedEvent = {
      agentId: 'default-agent',
      graph: workbench.graph,
      projectDirectory: workbench.project.directory,
      sessionId: 'agent-main',
      workspaceId: currentWorkspace.workspaceId
    }

    act(() => graphListener?.(event))

    expect(onGraphUpdated).toHaveBeenCalledWith(event)
  })
})
