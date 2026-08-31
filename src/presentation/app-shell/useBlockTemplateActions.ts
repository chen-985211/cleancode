import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'

import type { BlockTemplateSnapshot } from '../../contexts/block-graph/application/dto/BlockTemplateSnapshot'
import type { InstantiateBlockTemplateResult } from '../../contexts/block-graph/application/use-cases/InstantiateBlockTemplateUseCase'
import type { AppNotificationController } from '../shared/notifications/appNotifications'
import { useI18n } from '../i18n/useI18n'
import type { WorkbenchFlowNode, WorkbenchSnapshot } from './types'
import type { useTerminalWorkflow } from './useTerminalWorkflow'
import {
  useWorkbenchLayoutFocus,
  type WorkbenchLayoutFocusRequest
} from './useWorkbenchLayoutFocus'
import type { WorkbenchNodeStore } from './workbenchNodeStore'

interface BlockTemplateSavePresentation {
  readonly graph: WorkbenchSnapshot['graph']
  readonly open: boolean
  readonly projectDirectory: string
  readonly selectedBlockIds: readonly string[]
  readonly workspaceId: string
}

export function useBlockTemplateActions({
  currentWorkbench,
  currentWorkspace,
  nodeStore,
  notifications,
  protectedNodeIds,
  reactFlowInstanceRef,
  setCurrentGraph,
  terminalWorkflow
}: {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | undefined
  readonly nodeStore: WorkbenchNodeStore
  readonly notifications: AppNotificationController
  readonly protectedNodeIds: ReadonlySet<string>
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
  readonly setCurrentGraph: (graph: WorkbenchSnapshot['graph']) => void
  readonly terminalWorkflow: Pick<ReturnType<typeof useTerminalWorkflow>, 'startScope'>
}) {
  const { t } = useI18n()
  const [savePresentation, setSavePresentation] = useState<BlockTemplateSavePresentation | null>(
    null
  )
  const [placement, setPlacement] = useState<{
    readonly runAfterPlacement: boolean
    readonly template: BlockTemplateSnapshot
  } | null>(null)
  const [focusRequest, setFocusRequest] = useState<WorkbenchLayoutFocusRequest | null>(null)
  const placementOperationRef = useRef<symbol | null>(null)
  const activeScopeKeyRef = useRef(createWorkbenchScopeKey(currentWorkbench, currentWorkspace))
  activeScopeKeyRef.current = createWorkbenchScopeKey(currentWorkbench, currentWorkspace)

  useEffect(() => {
    placementOperationRef.current = null
    setSavePresentation(null)
    setPlacement(null)
    setFocusRequest(null)
  }, [currentWorkbench?.graph.id])

  const handleFocusComplete = useCallback((operationId: string) => {
    setFocusRequest((request) => (request?.operationId === operationId ? null : request))
  }, [])
  useWorkbenchLayoutFocus({
    nodeStore,
    onHandled: handleFocusComplete,
    protectedNodeIds,
    reactFlowInstanceRef,
    request: focusRequest
  })
  const requestSave = useCallback(
    (selectedBlockIds: readonly string[]): void => {
      if (!currentWorkbench || !currentWorkspace) return
      setSavePresentation({
        graph: currentWorkbench.graph,
        open: true,
        projectDirectory: currentWorkbench.project.directory,
        selectedBlockIds,
        workspaceId: currentWorkspace.workspaceId
      })
    },
    [currentWorkbench, currentWorkspace]
  )
  const closeSave = useCallback((): void => {
    setSavePresentation((current) => (current ? { ...current, open: false } : current))
  }, [])
  const completeSaveExit = useCallback((): void => {
    setSavePresentation((current) => (current?.open ? current : null))
  }, [])

  const place = useCallback(
    async (origin: { readonly x: number; readonly y: number }): Promise<void> => {
      if (!currentWorkbench || !currentWorkspace || !placement || placementOperationRef.current) {
        return
      }
      const operation = Symbol('block-template-placement')
      const requestedScopeKey = createWorkbenchScopeKey(currentWorkbench, currentWorkspace)
      placementOperationRef.current = operation

      try {
        const result = await window.cleancode?.instantiateBlockTemplate({
          origin,
          projectDirectory: currentWorkbench.project.directory,
          templateId: placement.template.id,
          workspaceId: currentWorkspace.workspaceId
        })
        if (!result) return
        if (activeScopeKeyRef.current !== requestedScopeKey) return

        setCurrentGraph(result.graph)
        setFocusRequest(createBlockTemplateFocusRequest(result))
        const shouldRun = placement.runAfterPlacement
        setPlacement(null)
        if (shouldRun) await terminalWorkflow.startScope(result.instance.executionScope)
      } catch {
        notifications.notify({
          kind: 'error',
          message: t('templates.placeFailed'),
          title: t('templates.placeFailedTitle')
        })
      } finally {
        if (placementOperationRef.current === operation) {
          placementOperationRef.current = null
        }
      }
    },
    [
      currentWorkbench,
      currentWorkspace,
      notifications,
      placement,
      setCurrentGraph,
      t,
      terminalWorkflow
    ]
  )

  return {
    beginPlacement: (template: BlockTemplateSnapshot, runAfterPlacement: boolean) => {
      setSavePresentation(null)
      setPlacement({ runAfterPlacement, template })
    },
    cancelPlacement: () => setPlacement(null),
    closeSave,
    completeSaveExit,
    place,
    placementTemplate: placement?.template,
    requestSave,
    savePresentation
  }
}

function createWorkbenchScopeKey(
  currentWorkbench: WorkbenchSnapshot | null,
  currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | undefined
): string | null {
  return currentWorkbench && currentWorkspace
    ? `${currentWorkbench.project.id}\0${currentWorkspace.workspaceId}`
    : null
}

function createBlockTemplateFocusRequest(
  result: InstantiateBlockTemplateResult
): WorkbenchLayoutFocusRequest {
  const focusNodeIds = result.instance.terminalGroupId
    ? [result.instance.terminalGroupId]
    : [...result.instance.blockIds]
  const expectedNodeLayouts = focusNodeIds.flatMap((nodeId) => {
    const layout =
      result.graph.blocks.find((block) => block.id === nodeId) ??
      result.graph.terminalGroups.find((group) => group.id === nodeId)
    return layout ? [{ nodeId, position: layout.position, size: layout.size }] : []
  })

  return {
    affectedNodeIds: [
      ...result.instance.blockIds,
      ...(result.instance.terminalGroupId ? [result.instance.terminalGroupId] : [])
    ],
    expectedNodeLayouts,
    focusNodeIds,
    focusTarget: 'projected-nodes',
    operationId: `block-template:${
      result.instance.terminalGroupId ?? result.instance.blockIds.join(':')
    }`
  }
}
