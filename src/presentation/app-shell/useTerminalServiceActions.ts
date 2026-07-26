import { useCallback } from 'react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { getTerminalDefinitionRuntimeApi } from './terminalDefinitionRuntime'
import type {
  ManagedTerminalServiceOwner,
  TerminalDefinitionInput,
  TerminalRunIdentity,
  TerminalServiceEndpoint,
  WorkbenchSnapshot
} from './types'

interface UseTerminalServiceActionsInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | undefined
  readonly focusTerminalBlock: (blockId: string) => void
  readonly rememberWorkbench: (workbench: WorkbenchSnapshot) => void
  readonly setCurrentGraph: (graph: WorkbenchSnapshot['graph']) => void
  readonly workbenches: readonly WorkbenchSnapshot[]
}

export function useTerminalServiceActions({
  currentWorkbench,
  currentWorkspace,
  focusTerminalBlock,
  rememberWorkbench,
  setCurrentGraph,
  workbenches
}: UseTerminalServiceActionsInput) {
  const updateTerminalDefinition = useCallback(
    async (block: TerminalBlockSnapshot, definition: TerminalDefinitionInput) => {
      if (!currentWorkbench || !currentWorkspace) return

      const api = getTerminalDefinitionRuntimeApi()
      if (typeof api?.updateTerminalDefinition !== 'function') {
        throw new Error('Terminal definition updates are unavailable.')
      }

      setCurrentGraph(
        await api.updateTerminalDefinition({
          projectDirectory: currentWorkbench.project.directory,
          workspaceId: currentWorkspace.workspaceId,
          blockId: block.id,
          name: definition.name,
          description: definition.description,
          launchCommand: definition.launchCommand,
          executionConfig: definition.executionConfig
        })
      )
    },
    [currentWorkbench, currentWorkspace, setCurrentGraph]
  )

  const copyServiceEndpoint = useCallback(async (endpoint: TerminalServiceEndpoint) => {
    await window.navigator.clipboard?.writeText(endpoint.displayAddress)
  }, [])

  const openServiceEndpoint = useCallback(async (identity: TerminalRunIdentity) => {
    await getTerminalDefinitionRuntimeApi()?.openTerminalServiceEndpoint?.({
      runId: identity.runId,
      sessionId: identity.sessionId,
      generation: identity.generation
    })
  }, [])

  const locateManagedServiceOwner = useCallback(
    async (owner: ManagedTerminalServiceOwner) => {
      const targetWorkbench = workbenches.find(
        (workbench) => workbench.project.id === owner.identity.projectId
      )

      if (!targetWorkbench) return

      const resolvedWorkbench =
        targetWorkbench.graph.workspaceId === owner.identity.workspaceId
          ? targetWorkbench
          : await window.cleancode?.switchBranchWorkspace({
              projectDirectory: targetWorkbench.project.directory,
              workspaceId: owner.identity.workspaceId
            })

      if (!resolvedWorkbench) return

      rememberWorkbench(resolvedWorkbench)
      window.setTimeout(() => focusTerminalBlock(owner.identity.blockId), 0)
    },
    [focusTerminalBlock, rememberWorkbench, workbenches]
  )

  return {
    copyServiceEndpoint,
    locateManagedServiceOwner,
    openServiceEndpoint,
    updateTerminalDefinition
  }
}
