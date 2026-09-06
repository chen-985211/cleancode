import { WorkspaceDefaultsAutosave } from './WorkspaceDefaultsAutosave'
import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { Edge, ReactFlowInstance } from '@xyflow/react'
import type {
  WorkspaceDefaults,
  WorkspaceInitializationDetails,
  WorkspaceInitializationSnapshot,
  WorkspaceInitializationResult
} from '../../../contexts/project/application/dto/WorkspaceInitializationDetails'
import { WorkspaceInitializationProgress } from '../../../contexts/project/presentation/components/WorkspaceInitializationProgress'
import type { WorkbenchSnapshot } from '../types/workbenchSnapshot'
import type { WorkbenchFlowNode } from '../types/workbenchFlowNode'
import type { WorkbenchNodeStore } from '../workbench/nodes/workbenchNodeStore'
import {
  useWorkbenchLayoutFocus,
  type WorkbenchLayoutFocusRequest
} from '../workbench/viewport/useWorkbenchLayoutFocus'
import { toAgentFlowNodeId } from '../projections/agentConsoleFlowNode'
import { workspaceInitializationPositions } from './workspaceInitializationPlacement'
import { WorkspaceDefaultsSettingsPane } from './WorkspaceDefaultsSettingsPane'
import { useI18n } from '../../i18n/useI18n'

interface WorkspaceInitializationInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly createWorkspace: (
    workbench: WorkbenchSnapshot,
    branchName: string,
    options?: { readonly requestId: string; readonly defaults?: WorkspaceDefaults }
  ) => Promise<WorkbenchSnapshot | undefined>
  readonly nodeStore: WorkbenchNodeStore
  readonly protectedNodeIds: ReadonlySet<string>
  readonly reactFlowInstanceRef: React.MutableRefObject<ReactFlowInstance<
    WorkbenchFlowNode,
    Edge
  > | null>
  readonly setCurrentWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>
  readonly setWorkbenches: Dispatch<SetStateAction<WorkbenchSnapshot[]>>
}

export function useWorkspaceInitialization({
  currentWorkbench,
  createWorkspace,
  nodeStore,
  protectedNodeIds,
  reactFlowInstanceRef,
  setCurrentWorkbench,
  setWorkbenches
}: WorkspaceInitializationInput) {
  const { t } = useI18n()
  const [autosaveStore] = useState(
    () =>
      new WorkspaceDefaultsAutosave(async (projectDirectory, defaults) => {
        await window.cleancode!.saveWorkspaceDefaults({ projectDirectory, defaults })
      })
  )
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, unknown>>({})
  const [focus, setFocus] = useState<WorkbenchLayoutFocusRequest | null>(null)
  const currentRef = useRef(currentWorkbench)
  currentRef.current = currentWorkbench
  const requests = useRef(new Map<string, string>())
  const active = useRef(new Set<string>())
  const cameraEpoch = useRef(0)
  const focusScope = useRef<string | null>(null)
  const currentScope = currentWorkbench
    ? `${currentWorkbench.project.id}:${currentWorkbench.graph.workspaceId}`
    : null
  if (focus && focusScope.current !== currentScope) setFocus(null)
  const cancelFocus = useCallback(() => {
    cameraEpoch.current += 1
    setFocus(null)
  }, [])
  const handledFocus = useCallback(() => setFocus(null), [])
  useWorkbenchLayoutFocus({
    nodeStore,
    protectedNodeIds,
    reactFlowInstanceRef,
    request: focus,
    onHandled: handledFocus
  })

  function update(result: WorkspaceInitializationResult) {
    const merge = (workbench: WorkbenchSnapshot): WorkbenchSnapshot => {
      if (
        workbench.project.id !== result.initialization.projectId ||
        workbench.graph.workspaceId !== result.initialization.workspaceId
      )
        return workbench
      return {
        ...workbench,
        graph: { ...result.graph, viewport: workbench.graph.viewport },
        agents: result.agents,
        initialization: result.initialization
      }
    }
    setWorkbenches((current) => current.map(merge))
    setCurrentWorkbench((current) => (current ? merge(current) : current))
  }

  async function apply(
    workbench: WorkbenchSnapshot,
    initializationId: string,
    action?: { retryItemId?: string; skipItemId?: string },
    prepared?: WorkspaceInitializationDetails,
    requestedCameraEpoch?: number
  ) {
    if (active.current.has(initializationId)) return
    const api = window.cleancode
    if (!api?.applyWorkspaceInitialization) return
    active.current.add(initializationId)
    setPending(new Set(active.current))
    setErrors((current) => ({ ...current, [initializationId]: null }))
    const epoch = requestedCameraEpoch ?? cameraEpoch.current
    try {
      const details =
        prepared ??
        (
          await api.listWorkspaceInitializations({
            projectDirectory: workbench.project.directory,
            workspaceId: workbench.graph.workspaceId
          })
        ).find((item) => item.initialization.id === initializationId)
      if (!details) return
      const latest = currentRef.current
      const target =
        latest?.project.id === workbench.project.id &&
        latest.graph.workspaceId === workbench.graph.workspaceId
          ? latest
          : workbench
      let result = await api.applyWorkspaceInitialization({
        initializationId,
        projectId: workbench.project.id,
        workspaceId: workbench.graph.workspaceId,
        positions: workspaceInitializationPositions(details, target, action?.retryItemId),
        ...action
      })
      update(result)
      const preparedNewGeometry = result.initialization.items.some(
        (item) =>
          item.kind === 'template' &&
          item.status === 'pending' &&
          item.prepared &&
          details.initialization.items.find((original) => original.id === item.id)?.prepared ===
            false
      )
      if (preparedNewGeometry) {
        const refreshed = (
          await api.listWorkspaceInitializations({
            projectDirectory: workbench.project.directory,
            workspaceId: workbench.graph.workspaceId
          })
        ).find((item) => item.initialization.id === initializationId)
        if (refreshed) {
          result = await api.applyWorkspaceInitialization({
            initializationId,
            projectId: workbench.project.id,
            workspaceId: workbench.graph.workspaceId,
            positions: workspaceInitializationPositions(
              refreshed,
              { ...target, graph: result.graph, agents: result.agents },
              action?.retryItemId
            )
          })
          update(result)
        }
      }
      const current = currentRef.current
      if (
        epoch === cameraEpoch.current &&
        current?.project.id === workbench.project.id &&
        current.graph.workspaceId === workbench.graph.workspaceId &&
        !action?.skipItemId
      ) {
        const groupMembers = new Set(
          result.graph.terminalGroups.flatMap((group) => group.memberBlockIds)
        )
        const layouts = [
          ...result.graph.blocks.filter((block) => !groupMembers.has(block.id)),
          ...result.graph.terminalGroups,
          ...result.agents.map((agent) => ({
            id: toAgentFlowNodeId(agent.agentId),
            ...agent.layout
          }))
        ]
        if (layouts.length) {
          focusScope.current = `${workbench.project.id}:${workbench.graph.workspaceId}`
          setFocus({
            operationId: crypto.randomUUID(),
            affectedNodeIds: layouts.map((item) => item.id),
            focusNodeIds: layouts.map((item) => item.id),
            expectedNodeLayouts: layouts.map((item) => ({
              nodeId: item.id,
              position: item.position,
              size: item.size
            })),
            focusTarget: 'committed-layouts'
          })
        }
      }
    } catch (error) {
      setErrors((current) => ({ ...current, [initializationId]: error }))
      throw error
    } finally {
      active.current.delete(initializationId)
      setPending(new Set(active.current))
    }
  }

  async function createBranchWorkspace(
    workbench: WorkbenchSnapshot,
    branchName: string
  ): Promise<boolean> {
    if (!window.cleancode?.applyWorkspaceInitialization)
      return Boolean(await createWorkspace(workbench, branchName))
    const key = `${workbench.project.id}:${branchName}`
    const requestId = requests.current.get(key) ?? crypto.randomUUID()
    requests.current.set(key, requestId)
    const creationCameraEpoch = cameraEpoch.current
    const result = await createWorkspace(workbench, branchName, {
      requestId,
      defaults: autosaveStore.get(workbench.project.directory)?.value
    })
    if (!result) return false
    requests.current.delete(key)
    if (result.initialization && result.initialization.stage !== 'complete') {
      await apply(
        result,
        result.initialization.id,
        undefined,
        undefined,
        creationCameraEpoch
      ).catch(() => undefined)
    }
    return true
  }

  const initialization = currentWorkbench?.initialization
  async function resume(workbench: WorkbenchSnapshot, operation: WorkspaceInitializationSnapshot) {
    const result = await createWorkspace(workbench, operation.branchName!, {
      requestId: operation.id
    })
    if (!result) throw new Error(t('workspaceDefaults.failed'))
    if (result.initialization) await apply(result, result.initialization.id)
  }
  async function cancel(operation: WorkspaceInitializationSnapshot) {
    await window.cleancode?.cancelWorkspaceInitialization({
      projectDirectory: operation.projectDirectory,
      initializationId: operation.id
    })
    setCurrentWorkbench((current) =>
      current?.initialization?.id === operation.id
        ? { ...current, initialization: { ...current.initialization, stage: 'cancelled' } }
        : current
    )
  }
  return {
    cancelFocus,
    createBranchWorkspace,
    renderSettings: (workbenches: readonly WorkbenchSnapshot[], onClose: () => void) => (
      <WorkspaceDefaultsSettingsPane
        autosaveStore={autosaveStore}
        workbenches={workbenches}
        currentProjectId={currentWorkbench?.project.id}
        onResume={async (workbench, operation) => {
          await resume(workbench, operation)
          onClose()
        }}
        onCancel={cancel}
      />
    ),
    canvasControls:
      currentWorkbench && initialization && window.cleancode?.applyWorkspaceInitialization ? (
        <WorkspaceInitializationProgress
          initialization={initialization}
          pending={pending.has(initialization.id)}
          error={errors[initialization.id]}
          onApply={(action) => {
            void apply(currentWorkbench, initialization.id, action).catch(() => undefined)
          }}
        />
      ) : null
  }
}
