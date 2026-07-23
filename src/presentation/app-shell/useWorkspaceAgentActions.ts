import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

import type { CreatableAgentProviderSnapshot } from '../../contexts/agent/application/dto/AgentProviderDiscoverySnapshot'
import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import { findCurrentWorkspace } from './findCurrentWorkspace'
import type { WorkbenchNodeLayoutInput, WorkbenchSnapshot } from './types'
import type { WorkbenchNodeLayoutCommitQueue } from './workbenchNodeLayoutCommitQueue'
import { useI18n } from './i18n/useI18n'

type CurrentWorkspace = WorkbenchSnapshot['project']['workspaces'][number]

export interface AgentProviderPickerState {
  readonly agentId: string
  readonly error: 'creation' | 'discovery' | null
  readonly pendingProviderId: string | null
  readonly providers: readonly CreatableAgentProviderSnapshot[] | null
}

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
  const [agentProviderPicker, setAgentProviderPicker] = useState<AgentProviderPickerState | null>(
    null
  )
  const providerRequestGenerationRef = useRef(0)
  const providerDiscoveryPendingRef = useRef(false)
  const creationIntentIdRef = useRef<string | null>(null)
  const workspaceScopeKey =
    currentWorkbench && currentWorkspace
      ? `${currentWorkbench.project.id}\0${currentWorkspace.name}`
      : null
  const workspaceScopeKeyRef = useRef(workspaceScopeKey)
  workspaceScopeKeyRef.current = workspaceScopeKey

  useEffect(() => {
    providerRequestGenerationRef.current += 1
    providerDiscoveryPendingRef.current = false
    creationIntentIdRef.current = null
    setAgentProviderPicker(null)
  }, [workspaceScopeKey])

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
    async (providerId: string): Promise<WorkspaceAgentSnapshot | null> => {
      const agentId = creationIntentIdRef.current
      if (!currentWorkbench || !currentWorkspace || !agentId) return null
      return (
        (await window.cleancode?.createWorkspaceAgent({
          agentId,
          gitBranch: currentWorkspace.gitBranch,
          projectDirectory: currentWorkbench.project.directory,
          projectId: currentWorkbench.project.id,
          providerId,
          workspaceDirectory: currentWorkspace.directory,
          workspaceName: currentWorkspace.name
        })) ?? null
      )
    },
    [currentWorkbench, currentWorkspace]
  )

  const discoverAgentProviders = useCallback(async () => {
    if (providerDiscoveryPendingRef.current) return
    const discoverProviders = window.cleancode?.discoverCreatableAgentProviders
    const generation = ++providerRequestGenerationRef.current
    providerDiscoveryPendingRef.current = true
    const agentId = creationIntentIdRef.current ?? createAgentId()
    creationIntentIdRef.current = agentId
    setAgentProviderPicker({
      agentId,
      error: null,
      pendingProviderId: null,
      providers: null
    })
    if (!discoverProviders) {
      providerDiscoveryPendingRef.current = false
      setAgentProviderPicker({
        agentId,
        error: 'discovery',
        pendingProviderId: null,
        providers: []
      })
      return
    }

    try {
      const providers = await discoverProviders({ refresh: true })
      if (providerRequestGenerationRef.current !== generation) return
      setAgentProviderPicker({
        agentId,
        error: null,
        pendingProviderId: null,
        providers
      })
    } catch {
      if (providerRequestGenerationRef.current !== generation) return
      setAgentProviderPicker({
        agentId,
        error: 'discovery',
        pendingProviderId: null,
        providers: []
      })
    } finally {
      if (providerRequestGenerationRef.current === generation) {
        providerDiscoveryPendingRef.current = false
      }
    }
  }, [])

  const createWorkspaceAgent = useCallback(async () => {
    if (!currentWorkbench || !currentWorkspace || agentProviderPicker) return
    const agents = currentWorkbench.agents ?? []
    if (agents.length > 0 && !window.confirm(t('agent.multipleWarning'))) return
    creationIntentIdRef.current = createAgentId()
    await discoverAgentProviders()
  }, [agentProviderPicker, currentWorkbench, currentWorkspace, discoverAgentProviders, t])

  const selectAgentProvider = useCallback(
    async (providerId: string) => {
      if (!agentProviderPicker || agentProviderPicker.pendingProviderId) return
      const generation = providerRequestGenerationRef.current
      const scopeKey = workspaceScopeKey
      setAgentProviderPicker({
        ...agentProviderPicker,
        error: null,
        pendingProviderId: providerId
      })
      try {
        const created = await createWorkspaceAgentWithProvider(providerId)
        if (
          providerRequestGenerationRef.current !== generation ||
          workspaceScopeKeyRef.current !== scopeKey
        ) {
          return
        }
        if (created) {
          updateWorkspaceAgentState(setCurrentWorkbench, created)
          setWorkbenches((entries) =>
            entries.map((workbench) => updateWorkbenchAgent(workbench, created))
          )
          onWorkspaceAgentCreated(created)
          setAgentProviderPicker(null)
          creationIntentIdRef.current = null
          return
        }
        setAgentProviderPicker({
          ...agentProviderPicker,
          error: 'creation',
          pendingProviderId: null
        })
      } catch {
        if (
          providerRequestGenerationRef.current !== generation ||
          workspaceScopeKeyRef.current !== scopeKey
        ) {
          return
        }
        setAgentProviderPicker({
          ...agentProviderPicker,
          error: 'creation',
          pendingProviderId: null
        })
      }
    },
    [
      agentProviderPicker,
      createWorkspaceAgentWithProvider,
      onWorkspaceAgentCreated,
      setCurrentWorkbench,
      setWorkbenches,
      workspaceScopeKey
    ]
  )

  const cancelAgentProviderSelection = useCallback(() => {
    providerRequestGenerationRef.current += 1
    providerDiscoveryPendingRef.current = false
    creationIntentIdRef.current = null
    setAgentProviderPicker(null)
  }, [])

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
    agentProviderPicker,
    cancelAgentProviderSelection,
    createWorkspaceAgent,
    discoverAgentProviders,
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

function upsertAgent(
  agents: readonly WorkspaceAgentSnapshot[],
  updated: WorkspaceAgentSnapshot
): readonly WorkspaceAgentSnapshot[] {
  return agents.some((agent) => agent.agentId === updated.agentId)
    ? replaceAgent(agents, updated)
    : [...agents, updated]
}

function updateWorkbenchAgent(
  workbench: WorkbenchSnapshot,
  updated: WorkspaceAgentSnapshot
): WorkbenchSnapshot {
  return workbench.project.id === updated.projectId &&
    findCurrentWorkspace(workbench)?.name === updated.workspaceName
    ? { ...workbench, agents: upsertAgent(workbench.agents ?? [], updated) }
    : workbench
}

function updateWorkspaceAgentState(
  setCurrentWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>,
  updated: WorkspaceAgentSnapshot
): void {
  setCurrentWorkbench((workbench) =>
    workbench ? updateWorkbenchAgent(workbench, updated) : workbench
  )
}

function createAgentId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `agent-${Date.now()}-${Math.random()}`
}
