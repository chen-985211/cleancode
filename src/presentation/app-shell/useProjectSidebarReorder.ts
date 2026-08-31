import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react'

import type { WorkbenchSnapshot } from './types'
import {
  createProjectReorderSpringController,
  resolveDirectProjectOffset,
  resolveProjectReorderPreviewOffsets
} from './projectReorderMotion'
import { usePrefersReducedMotion } from '../shared/hooks/usePrefersReducedMotion'

const projectDragThreshold = 4

interface ProjectDragState {
  readonly draggingProjectId: string | null
  readonly dropIndicatorY: number | null
}

interface ProjectDragSession {
  readonly pointerId: number
  readonly source: HTMLElement
  readonly workbench: WorkbenchSnapshot
  readonly startX: number
  readonly startY: number
  readonly startCardTop: number
  promoted: boolean
}

interface PendingProjectReorder {
  readonly orderKey: string
  sawPending: boolean
}

interface UseProjectSidebarReorderInput {
  readonly canReorder: boolean
  readonly getProjectList: () => HTMLElement | null
  readonly isReorderPending: boolean
  readonly onReorderProject: (
    workbench: WorkbenchSnapshot,
    beforeProjectDirectory: string | null
  ) => void
  readonly workbenches: readonly WorkbenchSnapshot[]
}

interface ProjectCardRect {
  readonly projectId: string
  readonly top: number
  readonly bottom: number
}

export function useProjectSidebarReorder({
  canReorder,
  getProjectList,
  isReorderPending,
  onReorderProject,
  workbenches
}: UseProjectSidebarReorderInput) {
  const [state, setState] = useState<ProjectDragState>({
    draggingProjectId: null,
    dropIndicatorY: null
  })
  const [isSessionArmed, setIsSessionArmed] = useState(false)
  const controller = useMemo(() => createProjectReorderSpringController(), [])
  const reducedMotion = usePrefersReducedMotion()
  const sessionRef = useRef<ProjectDragSession | null>(null)
  const pendingReorderRef = useRef<PendingProjectReorder | null>(null)
  const pendingFallbackFrameRef = useRef<number | null>(null)
  const latestDropIndexRef = useRef<number | null>(null)
  const workbenchesRef = useRef(workbenches)
  const onReorderProjectRef = useRef(onReorderProject)
  const getProjectListRef = useRef(getProjectList)
  const clickCleanupRef = useRef<(() => void) | null>(null)
  const reducedMotionRef = useRef(reducedMotion)
  const isReorderPendingRef = useRef(isReorderPending)
  const orderKey = workbenches.map((workbench) => workbench.project.id).join('\u0000')
  const orderKeyRef = useRef(orderKey)

  workbenchesRef.current = workbenches
  onReorderProjectRef.current = onReorderProject
  getProjectListRef.current = getProjectList
  reducedMotionRef.current = reducedMotion
  isReorderPendingRef.current = isReorderPending
  orderKeyRef.current = orderKey

  const syncControllerLayout = useCallback(
    (preservePresentation: boolean) => {
      const projectList = getProjectListRef.current()
      if (!projectList) return
      const cards = [...projectList.querySelectorAll<HTMLElement>('[data-project-card-id]')].map(
        (card) => {
          const id = card.dataset.projectCardId ?? ''
          const rect = card.getBoundingClientRect()
          return {
            id,
            surface: card,
            top: rect.top - controller.offsetFor(id)
          }
        }
      )
      controller.layoutChanged(cards, preservePresentation)
    },
    [controller]
  )

  const releasePresentation = useCallback(() => {
    controller.targetsChanged(new Map(), null, reducedMotionRef.current, () => undefined)
  }, [controller])

  const clearDragState = useCallback(() => {
    latestDropIndexRef.current = null
    setState({ draggingProjectId: null, dropIndicatorY: null })
    setIsSessionArmed(false)
  }, [])

  const computeDrop = useCallback(
    (pointerY: number) => {
      const projectList = getProjectListRef.current()
      const session = sessionRef.current

      if (!projectList || !session) {
        return null
      }

      const rects = measureProjectCardRects(projectList, controller.offsetFor)
      const dropIndex = resolveProjectDropIndex(pointerY, rects)
      const beforeProjectDirectory = resolveProjectReorderTarget(
        workbenchesRef.current,
        session.workbench.project.directory,
        dropIndex
      )

      if (beforeProjectDirectory === undefined) {
        return {
          directBaseTop: rects.find((rect) => rect.projectId === session.workbench.project.id)?.top,
          dropIndex: null,
          dropIndicatorY: null,
          previewOffsets: new Map(rects.map((rect) => [rect.projectId, 0]))
        }
      }

      return {
        dropIndex,
        directBaseTop: rects.find((rect) => rect.projectId === session.workbench.project.id)?.top,
        dropIndicatorY: resolveDropIndicatorY(projectList, rects, dropIndex),
        previewOffsets: resolveProjectReorderPreviewOffsets(
          rects,
          session.workbench.project.id,
          dropIndex
        )
      }
    },
    [controller.offsetFor]
  )

  const finishDrag = useCallback(
    (commit: boolean) => {
      const session = sessionRef.current

      if (!session) {
        clearDragState()
        return
      }

      if (typeof session.source.releasePointerCapture === 'function') {
        try {
          session.source.releasePointerCapture(session.pointerId)
        } catch {
          // Pointer capture can already be released after cancellation or unmount.
        }
      }

      if (session.promoted) {
        clickCleanupRef.current?.()
        const swallowClick = (event: MouseEvent): void => {
          if (event.target instanceof Node && session.source.contains(event.target)) {
            event.preventDefault()
            event.stopPropagation()
          }
          cleanupClickSwallow()
        }
        const cleanupClickSwallow = (): void => {
          window.removeEventListener('click', swallowClick, true)
          clickCleanupRef.current = null
        }
        window.addEventListener('click', swallowClick, true)
        clickCleanupRef.current = cleanupClickSwallow
        window.setTimeout(cleanupClickSwallow, 0)
      }

      const dropIndex = commit && session.promoted ? latestDropIndexRef.current : null
      sessionRef.current = null
      clearDragState()

      if (dropIndex === null) {
        releasePresentation()
        return
      }

      const beforeProjectDirectory = resolveProjectReorderTarget(
        workbenchesRef.current,
        session.workbench.project.directory,
        dropIndex
      )

      if (beforeProjectDirectory !== undefined) {
        pendingReorderRef.current = { orderKey: orderKeyRef.current, sawPending: false }
        onReorderProjectRef.current(session.workbench, beforeProjectDirectory)
        pendingFallbackFrameRef.current = window.requestAnimationFrame(() => {
          pendingFallbackFrameRef.current = null
          const pending = pendingReorderRef.current
          if (pending && !isReorderPendingRef.current && orderKeyRef.current === pending.orderKey) {
            pendingReorderRef.current = null
            releasePresentation()
          }
        })
      } else {
        releasePresentation()
      }
    },
    [clearDragState, releasePresentation]
  )

  useEffect(() => {
    if (!isSessionArmed) {
      return undefined
    }

    const onPointerMove = (event: PointerEvent): void => {
      const session = sessionRef.current

      if (!session || event.pointerId !== session.pointerId) {
        return
      }

      if (!session.promoted) {
        const deltaX = event.clientX - session.startX
        const deltaY = event.clientY - session.startY

        if (deltaX * deltaX + deltaY * deltaY < projectDragThreshold * projectDragThreshold) {
          return
        }

        session.promoted = true
        if (session.source.isConnected && typeof session.source.setPointerCapture === 'function') {
          try {
            session.source.setPointerCapture(session.pointerId)
          } catch {
            // Window listeners keep the drag active when capture is unavailable.
          }
        }
      }

      const drop = computeDrop(event.clientY)
      latestDropIndexRef.current = drop?.dropIndex ?? null
      if (drop?.directBaseTop !== undefined) {
        controller.targetsChanged(
          drop.previewOffsets,
          {
            id: session.workbench.project.id,
            offset: resolveDirectProjectOffset({
              currentBaseTop: drop.directBaseTop,
              pointerY: event.clientY,
              startCardTop: session.startCardTop,
              startPointerY: session.startY
            })
          },
          reducedMotionRef.current,
          () => undefined
        )
      }
      setState({
        draggingProjectId: session.workbench.project.id,
        dropIndicatorY: drop?.dropIndicatorY ?? null
      })
    }
    const onPointerUp = (event: PointerEvent): void => {
      if (event.pointerId === sessionRef.current?.pointerId) {
        finishDrag(true)
      }
    }
    const onPointerCancel = (event: PointerEvent): void => {
      if (event.pointerId === sessionRef.current?.pointerId) {
        finishDrag(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        finishDrag(false)
      }
    }
    const onBlur = (): void => finishDrag(false)

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onBlur)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onBlur)
    }
  }, [computeDrop, controller, finishDrag, isSessionArmed])

  useEffect(
    () => () => {
      clickCleanupRef.current?.()
      if (pendingFallbackFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingFallbackFrameRef.current)
      }
      controller.dispose()
    },
    [controller]
  )

  useLayoutEffect(() => {
    const pending = pendingReorderRef.current
    const orderChanged = Boolean(pending && pending.orderKey !== orderKey)
    syncControllerLayout(orderChanged)
    if (!pending) return
    if (isReorderPending) pending.sawPending = true
    if (orderChanged || (!isReorderPending && pending.sawPending)) {
      pendingReorderRef.current = null
      releasePresentation()
    }
  }, [isReorderPending, orderKey, releasePresentation, syncControllerLayout, workbenches])

  useEffect(() => {
    if (state.draggingProjectId === null) {
      return undefined
    }

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'

    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }
  }, [state.draggingProjectId])

  const onProjectPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>, workbench: WorkbenchSnapshot) => {
      if (!canReorder || event.button !== 0 || workbenchesRef.current.length <= 1) {
        return
      }

      syncControllerLayout(false)
      const projectId = workbench.project.id
      const sourceCard = getProjectListRef
        .current()
        ?.querySelector<HTMLElement>(`[data-project-card-id="${CSS.escape(projectId)}"]`)
      const startCardTop = sourceCard
        ? sourceCard.getBoundingClientRect().top - controller.offsetFor(projectId)
        : event.clientY

      sessionRef.current = {
        pointerId: event.pointerId,
        source: event.currentTarget,
        workbench,
        startX: event.clientX,
        startY: event.clientY,
        startCardTop,
        promoted: false
      }
      setIsSessionArmed(true)
    },
    [canReorder, controller, syncControllerLayout]
  )

  return { ...state, onProjectPointerDown }
}

function measureProjectCardRects(
  projectList: HTMLElement,
  offsetFor: (projectId: string) => number
): ProjectCardRect[] {
  return [...projectList.querySelectorAll<HTMLElement>('[data-project-card-id]')].map((card) => {
    const rect = card.getBoundingClientRect()
    const projectId = card.dataset.projectCardId ?? ''
    const offset = offsetFor(projectId)
    return {
      projectId,
      top: rect.top - offset,
      bottom: rect.bottom - offset
    }
  })
}

function resolveProjectDropIndex(pointerY: number, rects: readonly ProjectCardRect[]): number {
  const targetIndex = rects.findIndex((rect) => pointerY < (rect.top + rect.bottom) / 2)
  return targetIndex === -1 ? rects.length : targetIndex
}

function resolveDropIndicatorY(
  projectList: HTMLElement,
  rects: readonly ProjectCardRect[],
  dropIndex: number
): number | null {
  if (rects.length === 0) {
    return null
  }

  const listTop = projectList.getBoundingClientRect().top
  const previous = rects[dropIndex - 1]
  const next = rects[dropIndex]
  const viewportY =
    previous && next
      ? (previous.bottom + next.top) / 2
      : next
        ? next.top
        : (previous?.bottom ?? listTop)

  return viewportY - listTop + projectList.scrollTop
}

export function resolveProjectReorderTarget(
  workbenches: readonly WorkbenchSnapshot[],
  projectDirectory: string,
  dropIndex: number
): string | null | undefined {
  const sourceIndex = workbenches.findIndex(
    (workbench) => workbench.project.directory === projectDirectory
  )

  if (
    sourceIndex === -1 ||
    dropIndex < 0 ||
    dropIndex > workbenches.length ||
    dropIndex === sourceIndex ||
    dropIndex === sourceIndex + 1
  ) {
    return undefined
  }

  const remainingWorkbenches = workbenches.filter(
    (workbench) => workbench.project.directory !== projectDirectory
  )
  const adjustedDropIndex = dropIndex > sourceIndex ? dropIndex - 1 : dropIndex

  return remainingWorkbenches[adjustedDropIndex]?.project.directory ?? null
}
