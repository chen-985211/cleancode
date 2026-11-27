import type { StartIssueWorkspaceCommand } from '../../../contexts/project/application/dto/ProjectIssues'
import { WorkspaceDefaultsAutosave } from './WorkspaceDefaultsAutosave'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react'
import type { Edge, ReactFlowInstance } from '@xyflow/react'
import type {
  WorkspaceInitializationSnapshot,
  WorkspaceInitializationResult
} from '../../../contexts/project/application/dto/WorkspaceInitializationDetails'
import type { AppNotificationController } from '../../shared/notifications/appNotifications'
import { useWorkspaceInitializationNotifications } from './useWorkspaceInitializationNotifications'
import type { WorkbenchSnapshot } from '../types/workbenchSnapshot'
import type { WorkbenchFlowNode } from '../types/workbenchFlowNode'
import type { WorkbenchNodeStore } from '../workbench/nodes/workbenchNodeStore'
import {
  boundsOfWorkbenchLayouts,
  useWorkbenchLayoutFocus,
  type WorkbenchLayoutFocusRequest
} from '../workbench/viewport/useWorkbenchLayoutFocus'
import { toAgentFlowNodeId } from '../projections/agentConsoleFlowNode'
import { workspaceInitializationPositions } from './workspaceInitializationPlacement'
import { WorkspaceDefaultsSettingsPane } from './WorkspaceDefaultsSettingsPane'
import type { useBranchWorkspaceActions } from './useBranchWorkspaceActions'
import { useI18n } from '../../i18n/useI18n'
import { transitionWorkbenchViewport } from '../workbench/viewport/workbenchViewportMotion'
import { terminalBlockVisibleSize } from '../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { collapsedTerminalGroupSize } from '../projections/terminalFlowNodes'

interface WorkspaceInitializationInput {
  readonly notifications: AppNotificationController
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly createWorkspace: ReturnType<typeof useBranchWorkspaceActions>['createBranchWorkspace']
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
  notifications,
  createWorkspace,
  nodeStore,
  protectedNodeIds,
  reactFlowInstanceRef,
  setCurrentWorkbench,
  setWorkbenches
}: WorkspaceInitializationInput) {
  const { t } = useI18n()
  const feedback = useWorkspaceInitializationNotifications(
    notifications,
    async (workbench, action) => {
      if (workbench.initialization) await apply(workbench, workbench.initialization.id, action)
    }
  )
  const [autosaveStore] = useState(
    () =>
      new WorkspaceDefaultsAutosave(
        (projectDirectory, defaults) =>
          window.cleancode!.saveWorkspaceDefaults({ projectDirectory, defaults }),
        (directory, result) => feedback.reportCleanup(directory, result.removedTemplateIds)
      )
  )
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, unknown>>({})
  const [focus, setFocus] = useState<WorkbenchLayoutFocusRequest | null>(null)
  const currentRef = useRef(currentWorkbench)
  currentRef.current = currentWorkbench
  const requests = useRef(new Map<string, string>())
  const active = useRef(new Map<string, { mayFocus: boolean }>())
  const cameraEpoch = useRef(0)
  const focusScope = useRef<string | null>(null)
  const currentScope = currentWorkbench
    ? `${currentWorkbench.project.id}:${currentWorkbench.graph.workspaceId}`
    : null
  const currentInitializationId = currentWorkbench?.initialization?.id
  useLayoutEffect(() => {
    const operations = active.current
    return () => {
      const operation = currentInitializationId && operations.get(currentInitializationId)
      if (operation) operation.mayFocus = false
    }
  }, [currentScope, currentInitializationId])
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
    creation?: { cameraEpoch: number; canvasPaint: Promise<void> }
  ) {
    if (active.current.has(initializationId)) return
    const api = window.cleancode
    if (!api?.applyWorkspaceInitialization) return
    const operation = { mayFocus: true }
    active.current.set(initializationId, operation)
    setPending(new Set(active.current.keys()))
    setErrors((current) => ({ ...current, [initializationId]: null }))
    const epoch = creation?.cameraEpoch ?? cameraEpoch.current
    let result: WorkspaceInitializationResult | undefined
    try {
      const details = (
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
      result = await api.applyWorkspaceInitialization({
        initializationId,
        projectId: workbench.project.id,
        workspaceId: workbench.graph.workspaceId,
        positions: workspaceInitializationPositions(details, target, action?.retryItemId),
        ...action
      })
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
        }
      }
      feedback.report(workbench, result.initialization, false, null, true)
      if (creation) await creation.canvasPaint
      const current = currentRef.current
      if (
        operation.mayFocus &&
        epoch === cameraEpoch.current &&
        current?.project.id === workbench.project.id &&
        current.graph.workspaceId === workbench.graph.workspaceId &&
        !action?.skipItemId
      ) {
        const groupMembers = new Set(
          result.graph.terminalGroups.flatMap((group) => group.memberBlockIds)
        )
        const layouts = [
          ...result.graph.blocks
            .filter((block) => !groupMembers.has(block.id))
            .map((block) => ({
              ...block,
              size: terminalBlockVisibleSize(block)
            })),
          ...result.graph.terminalGroups.map((group) => ({
            ...group,
            size: group.isCollapsed ? collapsedTerminalGroupSize : group.size
          })),
          ...result.agents.map((agent) => ({
            id: toAgentFlowNodeId(agent.agentId),
            ...agent.layout
          }))
        ]
        if (creation) {
          const bounds = boundsOfWorkbenchLayouts(layouts)
          const instance = reactFlowInstanceRef.current
          if (bounds && instance) {
            // New objects start their entry spring on mount. Frame their final
            // rectangles while the canvas is still empty.
            await transitionWorkbenchViewport(instance, {
              type: 'fit-bounds',
              intent: { type: 'instant', persist: true },
              bounds,
              maxZoom: 1,
              padding: 0.24
            })
          }
        } else if (layouts.length) {
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
      if (workbench.initialization)
        feedback.report(workbench, workbench.initialization, false, error)
      throw error
    } finally {
      if (result) update(result)
      active.current.delete(initializationId)
      setPending(new Set(active.current.keys()))
    }
  }

  async function createBranchWorkspace(
    workbench: WorkbenchSnapshot,
    branchName: string,
    baseBranch?: string,
    issueCommand?: StartIssueWorkspaceCommand
  ): Promise<boolean> {
    if (!window.cleancode?.applyWorkspaceInitialization && !baseBranch)
      return Boolean(await createWorkspace(workbench, branchName))
    const key = JSON.stringify([
      workbench.project.id,
      branchName,
      baseBranch,
      issueCommand?.repository,
      issueCommand?.number
    ])
    const requestId = requests.current.get(key) ?? crypto.randomUUID()
    requests.current.set(key, requestId)
    const creationCameraEpoch = cameraEpoch.current
    const result = await createWorkspace(workbench, branchName, {
      requestId,
      ...(baseBranch ? { baseBranch } : {}),
      issueCommand,
      ...(issueCommand
        ? { beforeCreate: () => autosaveStore.flush(workbench.project.directory) }
        : {}),
      defaults: autosaveStore.get(workbench.project.directory)?.value
    })
    if (!result) return false
    requests.current.delete(key)
    if (result.initialization && result.initialization.stage !== 'complete') {
      // Let the selected empty canvas paint even when local initialization is fast.
      const canvasPaint = document.hidden
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          })
      void apply(result, result.initialization.id, undefined, {
        cameraEpoch: creationCameraEpoch,
        canvasPaint
      }).catch(() => undefined)
    }
    return true
  }

  const initialization = currentWorkbench?.initialization
  const { report } = feedback
  useEffect(() => {
    if (currentWorkbench && initialization)
      report(
        currentWorkbench,
        initialization,
        pending.has(initialization.id),
        errors[initialization.id]
      )
  }, [currentWorkbench, initialization, pending, errors, report, t])
  async function resume(workbench: WorkbenchSnapshot, operation: WorkspaceInitializationSnapshot) {
    const result = await createWorkspace(workbench, operation.branchName!, {
      requestId: operation.id,
      selectWorkspace: false,
      ...(operation.baseBranch ? { baseBranch: operation.baseBranch } : {})
    })
    if (!result) throw new Error(t('workspaceDefaults.failed'))
    if (result.initialization) {
      const failed = result.initialization.items.find((item) => item.status === 'failed')
      await apply(result, result.initialization.id, failed ? { retryItemId: failed.id } : undefined)
    }
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
    createIssueWorkspace: (workbench: WorkbenchSnapshot, command: StartIssueWorkspaceCommand) =>
      createBranchWorkspace(workbench, command.branchName, undefined, command),
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
    )
  }
}
