import { useState } from 'react'

import type { WorkspaceAgentSnapshot } from '../../src/contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { TerminalSurfaceRegistry } from '../../src/contexts/run/presentation/terminal-surface/terminalSurfaceRegistry'
import { AppShellProviders } from '../../src/presentation/app-shell/shell/AppShellProviders'
import type { WorkbenchSnapshot } from '../../src/presentation/app-shell/types/workbenchSnapshot'
import { AgentConsole } from '../../src/presentation/app-shell/workbench/nodes/agent/AgentConsole'
import { ignoreAppNotifications } from '../../src/presentation/shared/notifications/appNotifications'

export type AgentWorkspace = 'first' | 'second'

export function AgentWorkspacePresentationApp({
  agents,
  registry,
  workbench
}: {
  readonly agents: Record<AgentWorkspace, readonly WorkspaceAgentSnapshot[]>
  readonly registry: TerminalSurfaceRegistry
  readonly workbench: WorkbenchSnapshot
}) {
  const [workspace, setWorkspace] = useState<AgentWorkspace>('first')
  return (
    <AppShellProviders notifications={ignoreAppNotifications} terminalSurfaceRegistry={registry}>
      <div>
        {(['first', 'second'] as const).map((name) => (
          <button key={name} id={name} onClick={() => setWorkspace(name)}>
            {name}
          </button>
        ))}
      </div>
      <div
        data-current-workspace={workspace}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 600px)',
          gap: 20,
          transform: 'scale(.65)',
          transformOrigin: 'top left'
        }}
      >
        {agents[workspace].map((agent) => (
          <div
            className="agent-console-node"
            data-agent-console-node={agent.agentId}
            key={agent.agentId}
            style={{ width: 600, height: 360 }}
          >
            <AgentConsole
              agent={agent}
              currentWorkbench={workbench}
              currentWorkspace={workbench.project.workspaces.find(
                (item) => item.workspaceId === workspace
              )}
            />
          </div>
        ))}
      </div>
    </AppShellProviders>
  )
}
