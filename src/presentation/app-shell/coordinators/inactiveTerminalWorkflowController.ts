import type { useTerminalWorkflow } from './useTerminalWorkflow'

export const inactiveTerminalWorkflowController = {
  activeRunIdByRootBlockId: {},
  connect: async () => undefined,
  deleteEdges: async () => undefined,
  edges: [],
  nodeStatuses: {},
  runs: [],
  start: async () => undefined,
  startScope: async () => undefined,
  startTerminalCombination: async () => undefined,
  stoppingRunIds: [],
  stop: async () => undefined,
  updateExecutionConfig: async () => undefined
} satisfies ReturnType<typeof useTerminalWorkflow>
