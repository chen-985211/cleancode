import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

import {
  defaultAgentLayoutSize,
  type WorkspaceAgentSnapshot
} from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import { toAgentFlowNodeId } from './agentConsoleFlowNode'
import { findCurrentWorkspace } from './findCurrentWorkspace'
import type { WorkbenchNodeLayoutInput, WorkbenchSnapshot } from './types'
import type { WorkbenchNodeLayoutCommitQueue } from './workbenchNodeLayoutCommitQueue'
import { useI18n } from './i18n/useI18n'
import type { NotifyApp } from './appNotifications'
import type {
  WorkbenchNodeCreationCoordinator,
  WorkbenchNodeCreationReservation
} from './workbenchNodeCreationCoordinator'
import type { WorkbenchNodeSize } from './workbenchNodeCreationPolicy'
import { scheduleWorkbenchCreatedObjectFocus } from './workbenchObjectMotion'

type CurrentWorkspace = WorkbenchSnapshot['project']['workspaces'][number]

export function useWorkspaceAgentActions({
  currentWorkbench,
  currentWorkspace,
  defaultProviderId,
  layoutCommitQueue,
  nodeCreationCoordinator,
  notify,
  onConfigureAgentProviders,
  onWorkspaceAgentCreated,
  reserveWorkbenchNodeCreation,
  setCurrentWorkbench,
  setSelectedAgentId,
  setWorkbenches
}: {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: CurrentWorkspace | undefined
  readonly defaultProviderId: string | null
  readonly layoutCommitQueue: WorkbenchNodeLayoutCommitQueue
  readonly nodeCreationCoordinator: WorkbenchNodeCreationCoordinator
  readonly notify: NotifyApp
  readonly onConfigureAgentProviders: () => void
  readonly onWorkspaceAgentCreated: (agent: WorkspaceAgentSnapshot) => void
  readonly reserveWorkbenchNodeCreation: (
    nodeSize: WorkbenchNodeSize
  ) => WorkbenchNodeCreationReservation | null
  readonly setCurrentWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>
  readonly setSelectedAgentId: Dispatch<SetStateAction<string | null>>
  readonly setWorkbenches: Dispatch<SetStateAction<WorkbenchSnapshot[]>>
}) {
  const { t } = useI18n()
  const [isCreatingAgent, setIsCreatingAgent] = useState(false)
  const cancelScheduledCreationFocusRef = useRef<(() => void) | null>(null)
  const creationGenerationRef = useRef(0)
  const warnedWorkspaceScopesRef = useRef(new Set<string>())
  const workspaceScopeKey =
    currentWorkbench && currentWorkspace
      ? `${currentWorkbench.project.id}\0${currentWorkspace.workspaceId}`
      : null
  const workspaceScopeKeyRef = useRef(workspaceScopeKey)
  workspaceScopeKeyRef.current = workspaceScopeKey

  useEffect(() => {
    creationGenerationRef.current += 1
    setIsCreatingAgent(false)
    return () => {
      cancelScheduledCreationFocusRef.current?.()
      cancelScheduledCreationFocusRef.current = null
    }
  }, [workspaceScopeKey])

  const setWorkspaceAgents = useCallback(
    (projectId: string, workspaceId: string, agents: readonly WorkspaceAgentSnapshot[]): void => {
      const update = (workbench: WorkbenchSnapshot): WorkbenchSnapshot =>
        workbench.project.id === projectId &&
        findCurrentWorkspace(workbench)?.workspaceId === workspaceId
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

  const createWorkspaceAgent = useCallback(
    async (providerId?: string) => {
      if (!currentWorkbench || !currentWorkspace || isCreatingAgent) return
      const selectedProviderId = providerId ?? defaultProviderId
      if (!selectedProviderId) {
        onConfigureAgentProviders()
        return
      }
      const reservation = reserveWorkbenchNodeCreation(defaultAgentLayoutSize)

      if (!reservation) {
        return
      }

      const generation = ++creationGenerationRef.current
      const scopeKey = workspaceScopeKey
      let isCommitted = false
      setIsCreatingAgent(true)
      if (
        (currentWorkbench.agents?.length ?? 0) > 0 &&
        scopeKey &&
        !warnedWorkspaceScopesRef.current.has(scopeKey)
      ) {
        warnedWorkspaceScopesRef.current.add(scopeKey)
        notify({
          autoDismissMs: 6_000,
          kind: 'info',
          message: t('agent.multipleNotice'),
          title: t('agent.multipleNoticeTitle')
        })
      }
      try {
        const created =
          (await window.cleancode?.createWorkspaceAgent({
            agentId: createAgentId(),
            gitBranch: currentWorkspace.gitBranch,
            projectDirectory: currentWorkbench.project.directory,
            projectId: currentWorkbench.project.id,
            providerId: selectedProviderId,
            initialPosition: reservation.position,
            workspaceDirectory: currentWorkspace.directory,
            workspaceId: currentWorkspace.workspaceId
          })) ?? null
        if (
          generation !== creationGenerationRef.current ||
          workspaceScopeKeyRef.current !== scopeKey
        ) {
          return
        }
        if (!created) throw new Error('Agent creation returned no snapshot.')
        nodeCreationCoordinator.commit(
          reservation.reservationId,
          toAgentFlowNodeId(created.agentId)
        )
        isCommitted = true
        updateWorkspaceAgentState(setCurrentWorkbench, created)
        setWorkbenches((entries) =>
          entries.map((workbench) => updateWorkbenchAgent(workbench, created))
        )
        cancelScheduledCreationFocusRef.current?.()
        cancelScheduledCreationFocusRef.current = scheduleWorkbenchCreatedObjectFocus(() => {
          cancelScheduledCreationFocusRef.current = null
          if (
            generation === creationGenerationRef.current &&
            workspaceScopeKeyRef.current === scopeKey
          ) {
            onWorkspaceAgentCreated(created)
          }
        })
      } catch {
        if (
          generation === creationGenerationRef.current &&
          workspaceScopeKeyRef.current === scopeKey
        ) {
          notify({
            kind: 'error',
            message: t('agent.creationFailedDescription'),
            title: t('agent.creationFailed')
          })
        }
      } finally {
        if (!isCommitted) {
          nodeCreationCoordinator.release(reservation.reservationId)
        }
        if (generation === creationGenerationRef.current) setIsCreatingAgent(false)
      }
    },
    [
      currentWorkbench,
      currentWorkspace,
      defaultProviderId,
      isCreatingAgent,
      nodeCreationCoordinator,
      notify,
      onConfigureAgentProviders,
      onWorkspaceAgentCreated,
      reserveWorkbenchNodeCreation,
      setCurrentWorkbench,
      setWorkbenches,
      t,
      workspaceScopeKey
    ]
  )

  const updateAgentInWorkspace = useCallback(
    (updated: WorkspaceAgentSnapshot): void => {
      const update = (workbench: WorkbenchSnapshot): WorkbenchSnapshot => {
        if (
          workbench.project.id !== updated.projectId ||
          findCurrentWorkspace(workbench)?.workspaceId !== updated.workspaceId
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
        workspaceId: agent.workspaceId
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
        workspaceId: agent.workspaceId
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
        `agent:${agent.projectId}:${agent.workspaceId}:${agent.agentId}`,
        () =>
          window.cleancode?.updateWorkspaceAgentLayout({
            agentId: agent.agentId,
            layout: { position, size },
            projectId: agent.projectId,
            workspaceId: agent.workspaceId
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
        workspaceId: agent.workspaceId
      })
      if (remaining) {
        setWorkspaceAgents(agent.projectId, agent.workspaceId, remaining)
      }
    },
    [setWorkspaceAgents]
  )

  return {
    createWorkspaceAgent,
    isCreatingAgent,
    moveWorkspaceAgent,
    removeWorkspaceAgent,
    renameWorkspaceAgent,
    resizeWorkspaceAgent,
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
    findCurrentWorkspace(workbench)?.workspaceId === updated.workspaceId
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
