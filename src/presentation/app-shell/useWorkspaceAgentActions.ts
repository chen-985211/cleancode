import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react'

import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { AgentProviderDescriptor } from '../../contexts/agent/application/ports/AgentProviderContribution'
import { defaultAgentLayoutSize } from '../../contexts/agent/domain/aggregates/AgentSession'
import { resolveNewAgentConsolePosition } from './agentConsolePlacement'
import { findCurrentWorkspace } from './findCurrentWorkspace'
import type { WorkbenchNodeLayoutInput, WorkbenchSnapshot } from './types'
import type { WorkbenchNodeLayoutCommitQueue } from './workbenchNodeLayoutCommitQueue'
import { useI18n } from './i18n/useI18n'

type CurrentWorkspace = WorkbenchSnapshot['project']['workspaces'][number]

export function useWorkspaceAgentActions({
  currentWorkbench,
  currentWorkspace,
  layoutCommitQueue,
  onWorkspaceAgentCreated,
  setCurrentWorkbench,
  setSelectedAgentId,
  setWorkbenches
}: {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: CurrentWorkspace | undefined
  readonly layoutCommitQueue: WorkbenchNodeLayoutCommitQueue
  readonly onWorkspaceAgentCreated: (agent: WorkspaceAgentSnapshot) => void
  readonly setCurrentWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>
  readonly setSelectedAgentId: Dispatch<SetStateAction<string | null>>
  readonly setWorkbenches: Dispatch<SetStateAction<WorkbenchSnapshot[]>>
}) {
  const { t } = useI18n()
  const [agentProviderChoices, setAgentProviderChoices] = useState<
    readonly AgentProviderDescriptor[] | null
  >(null)
  const isProviderListPendingRef = useRef(false)
  const setWorkspaceAgents = useCallback(
    (projectId: string, workspaceName: string, agents: readonly WorkspaceAgentSnapshot[]): void => {
      const update = (workbench: WorkbenchSnapshot): WorkbenchSnapshot =>
        workbench.project.id === projectId &&
        findCurrentWorkspace(workbench)?.name === workspaceName
          ? { ...workbench, agents }
          : workbench
      setCurrentWorkbench((workbench) => (workbench ? update(workbench) : workbench))
      setWorkbenches((entries) => entries.map(update))
      setSelectedAgentId((agentId) =>
        agentId && agents.some((agent) => agent.agentId === agentId) ? agentId : null
      )
    },
    [setCurrentWorkbench, setSelectedAgentId, setWorkbenches]
  )

  const createWorkspaceAgentWithProvider = useCallback(
    async (providerId: string) => {
      if (!currentWorkbench || !currentWorkspace) return
      const agents = currentWorkbench.agents ?? []
      const position = resolveNewAgentConsolePosition(agents.map((agent) => agent.layout))
      const created = await window.cleancode?.createWorkspaceAgent({
        layout: {
          position,
          size: defaultAgentLayoutSize
        },
        projectId: currentWorkbench.project.id,
        providerId,
        workspaceName: currentWorkspace.name
      })
      if (created) {
        setWorkspaceAgents(currentWorkbench.project.id, currentWorkspace.name, [...agents, created])
        onWorkspaceAgentCreated(created)
      }
    },
    [currentWorkbench, currentWorkspace, onWorkspaceAgentCreated, setWorkspaceAgents]
  )

  const createWorkspaceAgent = useCallback(async () => {
    if (!currentWorkbench || !currentWorkspace || isProviderListPendingRef.current) return
    const agents = currentWorkbench.agents ?? []
    if (agents.length > 0 && !window.confirm(t('agent.multipleWarning'))) return

    const listProviders = window.cleancode?.listAgentProviders
    if (!listProviders) return
    isProviderListPendingRef.current = true
    try {
      const providers = await listProviders()
      if (providers.length === 1) {
        await createWorkspaceAgentWithProvider(providers[0].id)
      } else if (providers.length > 1) {
        setAgentProviderChoices(providers)
      }
    } finally {
      isProviderListPendingRef.current = false
    }
  }, [createWorkspaceAgentWithProvider, currentWorkbench, currentWorkspace, t])

  const selectAgentProvider = useCallback(
    async (providerId: string) => {
      setAgentProviderChoices(null)
      await createWorkspaceAgentWithProvider(providerId)
    },
    [createWorkspaceAgentWithProvider]
  )

  const cancelAgentProviderSelection = useCallback(() => setAgentProviderChoices(null), [])

  const updateAgentInWorkspace = useCallback(
    (updated: WorkspaceAgentSnapshot): void => {
      const update = (workbench: WorkbenchSnapshot): WorkbenchSnapshot => {
        if (
          workbench.project.id !== updated.projectId ||
          findCurrentWorkspace(workbench)?.name !== updated.workspaceName
        ) {
          return workbench
        }

        return {
          ...workbench,
          agents: replaceAgent(workbench.agents ?? [], updated)
        }
      }

      setCurrentWorkbench((workbench) => (workbench ? update(workbench) : workbench))
      setWorkbenches((entries) => entries.map(update))
    },
    [setCurrentWorkbench, setWorkbenches]
  )

  const renameWorkspaceAgent = useCallback(
    async (agent: WorkspaceAgentSnapshot, name: string) => {
      const updated = await window.cleancode?.renameWorkspaceAgent({
        agentId: agent.agentId,
        name,
        projectId: agent.projectId,
        workspaceName: agent.workspaceName
      })
      if (updated) updateAgentInWorkspace(updated)
    },
    [updateAgentInWorkspace]
  )

  const updateWorkspaceAgentMcpCapability = useCallback(
    async (agent: WorkspaceAgentSnapshot, cleancodeMcpEnabled: boolean) => {
      const result = await window.cleancode?.updateWorkspaceAgentMcpCapability({
        agentId: agent.agentId,
        cleancodeMcpEnabled,
        projectId: agent.projectId,
        workspaceName: agent.workspaceName
      })
      if (result) updateAgentInWorkspace(result.agent)
      return result
    },
    [updateAgentInWorkspace]
  )

  const updateWorkspaceAgentLayout = useCallback(
    async (
      agent: WorkspaceAgentSnapshot,
      position: { readonly x: number; readonly y: number },
      size: { readonly width: number; readonly height: number }
    ): Promise<void> => {
      await layoutCommitQueue.enqueue(
        `agent:${agent.projectId}:${agent.workspaceName}:${agent.agentId}`,
        () =>
          window.cleancode?.updateWorkspaceAgentLayout({
            agentId: agent.agentId,
            layout: { position, size },
            projectId: agent.projectId,
            workspaceName: agent.workspaceName
          }) ?? Promise.resolve(undefined),
        (updated) => {
          if (updated) updateAgentInWorkspace(updated)
        }
      )
    },
    [layoutCommitQueue, updateAgentInWorkspace]
  )

  const resizeWorkspaceAgent = useCallback(
    async (agent: WorkspaceAgentSnapshot, layout: WorkbenchNodeLayoutInput) => {
      await updateWorkspaceAgentLayout(agent, layout.position, layout.size)
    },
    [updateWorkspaceAgentLayout]
  )

  const moveWorkspaceAgent = useCallback(
    async (
      agent: WorkspaceAgentSnapshot,
      position: { readonly x: number; readonly y: number },
      size: { readonly width: number; readonly height: number }
    ) => updateWorkspaceAgentLayout(agent, position, size),
    [updateWorkspaceAgentLayout]
  )

  const removeWorkspaceAgent = useCallback(
    async (agent: WorkspaceAgentSnapshot) => {
      const remaining = await window.cleancode?.removeWorkspaceAgent({
        agentId: agent.agentId,
        projectId: agent.projectId,
        workspaceName: agent.workspaceName
      })
      if (remaining) {
        setWorkspaceAgents(agent.projectId, agent.workspaceName, remaining)
      }
    },
    [setWorkspaceAgents]
  )

  return {
    agentProviderChoices,
    cancelAgentProviderSelection,
    createWorkspaceAgent,
    moveWorkspaceAgent,
    removeWorkspaceAgent,
    renameWorkspaceAgent,
    resizeWorkspaceAgent,
    selectAgentProvider,
    updateWorkspaceAgentMcpCapability
  }
}

function replaceAgent(
  agents: readonly WorkspaceAgentSnapshot[],
  updated: WorkspaceAgentSnapshot
): readonly WorkspaceAgentSnapshot[] {
  return agents.map((agent) => (agent.agentId === updated.agentId ? updated : agent))
}
