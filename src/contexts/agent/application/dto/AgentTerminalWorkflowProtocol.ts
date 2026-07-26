interface AgentTerminalTaskExecutionConfigSnapshot {
  readonly mode: 'task'
  readonly successExitCodes: readonly number[]
  readonly timeoutMs: number | null
}

interface AgentTerminalOutputReadinessSnapshot {
  readonly text: string
  readonly type: 'output'
}

interface AgentTerminalTcpReadinessSnapshot {
  readonly type: 'tcp'
}

type AgentTerminalServicePortPolicySnapshot =
  | { readonly port: number; readonly type: 'fixed' }
  | { readonly port: number; readonly type: 'preferred' }
  | { readonly type: 'auto' }

type AgentTerminalServicePortBindingSnapshot =
  | { readonly type: 'none' }
  | { readonly type: 'environment'; readonly variableName: string }
  | { readonly template: string; readonly type: 'argument' }

interface AgentTerminalServicePortIntentSnapshot {
  readonly binding: AgentTerminalServicePortBindingSnapshot
  readonly policy: AgentTerminalServicePortPolicySnapshot
  readonly protocol: 'http' | 'https' | 'tcp'
}

interface AgentTerminalServiceExecutionConfigSnapshot {
  readonly mode: 'service'
  readonly port?: AgentTerminalServicePortIntentSnapshot
  readonly readiness: AgentTerminalOutputReadinessSnapshot | AgentTerminalTcpReadinessSnapshot
  readonly readinessTimeoutMs: number
}

export type AgentTerminalExecutionConfigSnapshot =
  AgentTerminalTaskExecutionConfigSnapshot | AgentTerminalServiceExecutionConfigSnapshot

export type AgentTerminalWorkflowPlanScope =
  { readonly type: 'full' } | { readonly blockId: string; readonly type: 'from-block' }

interface AgentTerminalWorkflowPlanNodeSnapshot {
  readonly blockId: string
  readonly dependencyBlockIds: readonly string[]
  readonly executionConfig: AgentTerminalExecutionConfigSnapshot
  readonly launchCommand: string
  readonly name: string
}

export interface AgentTerminalWorkflowPlanSnapshot {
  readonly graphId: string
  readonly nodes: readonly AgentTerminalWorkflowPlanNodeSnapshot[]
  readonly workspaceId: string
}
