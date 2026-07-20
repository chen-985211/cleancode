import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react'

import type { WorkbenchSnapshot } from './types'

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
  promoted: boolean
}

interface UseProjectSidebarReorderInput {
  readonly canReorder: boolean
  readonly getProjectList: () => HTMLElement | null
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
  onReorderProject,
  workbenches
}: UseProjectSidebarReorderInput) {
  const [state, setState] = useState<ProjectDragState>({
    draggingProjectId: null,
    dropIndicatorY: null
  })
  const [isSessionArmed, setIsSessionArmed] = useState(false)
  const sessionRef = useRef<ProjectDragSession | null>(null)
  const latestDropIndexRef = useRef<number | null>(null)
  const workbenchesRef = useRef(workbenches)
  const onReorderProjectRef = useRef(onReorderProject)
  const getProjectListRef = useRef(getProjectList)
  const clickCleanupRef = useRef<(() => void) | null>(null)

  workbenchesRef.current = workbenches
  onReorderProjectRef.current = onReorderProject
  getProjectListRef.current = getProjectList

  const clearDragState = useCallback(() => {
    latestDropIndexRef.current = null
    setState({ draggingProjectId: null, dropIndicatorY: null })
    setIsSessionArmed(false)
  }, [])

  const computeDrop = useCallback((pointerY: number) => {
    const projectList = getProjectListRef.current()
    const session = sessionRef.current

    if (!projectList || !session) {
      return null
    }

    const rects = measureProjectCardRects(projectList)
    const dropIndex = resolveProjectDropIndex(pointerY, rects)
    const beforeProjectDirectory = resolveProjectReorderTarget(
      workbenchesRef.current,
      session.workbench.project.directory,
      dropIndex
    )

    if (beforeProjectDirectory === undefined) {
      return null
    }

    return {
      dropIndex,
      dropIndicatorY: resolveDropIndicatorY(projectList, rects, dropIndex)
    }
  }, [])

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
        return
      }

      const beforeProjectDirectory = resolveProjectReorderTarget(
        workbenchesRef.current,
        session.workbench.project.directory,
        dropIndex
      )

      if (beforeProjectDirectory !== undefined) {
        onReorderProjectRef.current(session.workbench, beforeProjectDirectory)
      }
    },
    [clearDragState]
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
  }, [computeDrop, finishDrag, isSessionArmed])

  useEffect(
    () => () => {
      clickCleanupRef.current?.()
    },
    []
  )

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

      sessionRef.current = {
        pointerId: event.pointerId,
        source: event.currentTarget,
        workbench,
        startX: event.clientX,
        startY: event.clientY,
        promoted: false
      }
      setIsSessionArmed(true)
    },
    [canReorder]
  )

  return { ...state, onProjectPointerDown }
}

function measureProjectCardRects(projectList: HTMLElement): ProjectCardRect[] {
  return [...projectList.querySelectorAll<HTMLElement>('[data-project-card-id]')].map((card) => {
    const rect = card.getBoundingClientRect()
    return {
      projectId: card.dataset.projectCardId ?? '',
      top: rect.top,
      bottom: rect.bottom
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
