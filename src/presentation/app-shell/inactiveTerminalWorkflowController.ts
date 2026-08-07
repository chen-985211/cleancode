import type { useTerminalWorkflow } from './useTerminalWorkflow'

export const inactiveTerminalWorkflowController = {
  activeRootBlockIds: [],
  connect: async () => undefined,
  deleteEdges: async () => undefined,
  edges: [],
  isActive: false,
  isStopping: false,
  nodeStatuses: {},
  run: null,
  start: async () => undefined,
  startScope: async () => undefined,
  startTerminalCombination: async () => undefined,
  stop: async () => undefined,
  updateExecutionConfig: async () => undefined
} satisfies ReturnType<typeof useTerminalWorkflow>
