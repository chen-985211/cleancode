import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type PropsWithChildren,
  type Ref
} from 'react'

import {
  createCanvasMenuMotionController,
  type CanvasMenuMotionController,
  type CanvasMenuMotionFrameScheduler,
  type CanvasMenuMotionPresentation
} from './canvasMenuMotion'
import { prefersReducedMotion } from './workbenchViewportMotionEnvironment'

export interface CanvasMenuAnchor {
  readonly x: number
  readonly y: number
}

interface CanvasMenuMotionProviderProps extends PropsWithChildren {
  readonly reducedMotion?: boolean
  readonly resetKey?: string | null
  readonly scheduler?: CanvasMenuMotionFrameScheduler
}

interface CanvasMenuCoordinator {
  readonly activate: (menuId: string, onRequestClose: () => void) => void
  readonly createMotion: (
    onPresent: (presentation: CanvasMenuMotionPresentation) => void
  ) => CanvasMenuMotionController
  readonly deactivate: (menuId: string) => void
  readonly present: (menuId: string, progress: number) => void
  readonly release: (menuId: string) => void
  readonly reset: () => void
  readonly setBackdrop: (backdrop: HTMLDivElement | null) => void
}

interface CanvasMenuRecord {
  onRequestClose: () => void
  progress: number
}

export interface CanvasMenuSurfaceProps extends Omit<HTMLAttributes<HTMLDivElement>, 'className'> {
  readonly anchor: CanvasMenuAnchor
  readonly className?: string
  readonly menuId: string
  readonly motionReady: boolean
  readonly open: boolean
  readonly onExitComplete?: () => void
  readonly onPresenceChange?: (present: boolean) => void
  readonly onRequestClose: () => void
}

const CanvasMenuMotionContext = createContext<CanvasMenuCoordinator | null>(null)

export function CanvasMenuMotionProvider({
  children,
  reducedMotion,
  resetKey,
  scheduler
}: CanvasMenuMotionProviderProps) {
  const coordinator = useMemo(
    () =>
      createCanvasMenuCoordinator({
        reducedMotion: reducedMotion ?? prefersReducedMotion(),
        scheduler
      }),
    [reducedMotion, scheduler]
  )
  const backdropRef = useRef<HTMLDivElement | null>(null)
  const previousResetKeyRef = useRef(resetKey)

  useLayoutEffect(() => {
    coordinator.setBackdrop(backdropRef.current)
    return () => coordinator.setBackdrop(null)
  }, [coordinator])

  useEffect(() => {
    if (Object.is(previousResetKeyRef.current, resetKey)) return
    previousResetKeyRef.current = resetKey
    coordinator.reset()
  }, [coordinator, resetKey])

  useEffect(() => () => coordinator.reset(), [coordinator])

  return (
    <CanvasMenuMotionContext.Provider value={coordinator}>
      {children}
      <div
        ref={backdropRef}
        aria-hidden="true"
        className="canvas-menu-backdrop"
        data-motion-state="closed"
        data-testid="canvas-menu-backdrop"
        style={
          {
            '--canvas-menu-backdrop-progress': 0,
            pointerEvents: 'none'
          } as CSSProperties
        }
      />
    </CanvasMenuMotionContext.Provider>
  )
}

export const CanvasMenuSurface = forwardRef<HTMLDivElement, CanvasMenuSurfaceProps>(
  function CanvasMenuSurface(
    {
      anchor,
      children,
      className,
      menuId,
      motionReady,
      open,
      onExitComplete,
      onPresenceChange,
      onRequestClose,
      ...props
    },
    forwardedRef
  ) {
    const coordinator = useCanvasMenuCoordinator()
    const surfaceRef = useRef<HTMLDivElement | null>(null)
    const anchorRef = useRef(anchor)
    const openRef = useRef(open)
    const exitCompleteRef = useRef(onExitComplete)
    const presentationRef = useRef<CanvasMenuMotionPresentation>({
      phase: 'closed',
      progress: 0,
      velocity: 0
    })
    const [isPresent, setIsPresent] = useState(open)
    const [previousOpen, setPreviousOpen] = useState(open)
    const controllerRef = useRef<CanvasMenuMotionController | null>(null)

    useLayoutEffect(() => {
      const controller = coordinator.createMotion((presentation) => {
        presentationRef.current = presentation
        applyCanvasMenuPresentation(surfaceRef.current, anchorRef.current, presentation)
        coordinator.present(menuId, presentation.progress)
      })
      controllerRef.current = controller
      return () => {
        controller.dispose()
        controllerRef.current = null
        coordinator.release(menuId)
      }
    }, [coordinator, menuId])

    if (open !== previousOpen) {
      setPreviousOpen(open)
      if (open) setIsPresent(true)
    }

    useLayoutEffect(() => {
      anchorRef.current = anchor
      openRef.current = open
      exitCompleteRef.current = onExitComplete
      applyCanvasMenuPresentation(surfaceRef.current, anchor, presentationRef.current)
    }, [anchor, onExitComplete, open])

    useLayoutEffect(() => {
      onPresenceChange?.(isPresent)
    }, [isPresent, onPresenceChange])

    useLayoutEffect(() => {
      if (!isPresent) return
      const controller = controllerRef.current
      if (!controller) return

      if (open && motionReady) {
        coordinator.activate(menuId, onRequestClose)
        void controller.setOpen(true)
        return
      }
      if (open) return

      coordinator.deactivate(menuId)
      void controller.setOpen(false).then((completed) => {
        if (!completed || openRef.current) return
        setIsPresent(false)
        coordinator.release(menuId)
        exitCompleteRef.current?.()
      })
    }, [coordinator, isPresent, menuId, motionReady, onRequestClose, open])

    if (!isPresent) return null

    return (
      <div
        {...props}
        ref={(element) => {
          surfaceRef.current = element
          assignRef(forwardedRef, element)
        }}
        aria-hidden={open && motionReady ? props['aria-hidden'] : true}
        className={['canvas-menu-motion-surface', className].filter(Boolean).join(' ')}
        data-interactive={open && motionReady}
        inert={open && motionReady ? undefined : true}
      >
        {children}
      </div>
    )
  }
)

function createCanvasMenuCoordinator({
  reducedMotion,
  scheduler
}: {
  readonly reducedMotion: boolean
  readonly scheduler?: CanvasMenuMotionFrameScheduler
}): CanvasMenuCoordinator {
  const controllers = new Set<CanvasMenuMotionController>()
  const records = new Map<string, CanvasMenuRecord>()
  let activeMenuId: string | null = null
  let backdrop: HTMLDivElement | null = null
  let resetting = false

  const updateBackdrop = (): void => {
    const progress = Math.max(0, ...[...records.values()].map((record) => record.progress))
    backdrop?.style.setProperty('--canvas-menu-backdrop-progress', `${round(progress)}`)
    if (backdrop) backdrop.dataset.motionState = progress > 0 ? 'open' : 'closed'
  }

  return {
    activate: (menuId, onRequestClose) => {
      const previous = activeMenuId ? records.get(activeMenuId) : null
      const previousMenuId = activeMenuId
      activeMenuId = menuId
      const record = records.get(menuId) ?? { onRequestClose, progress: 0 }
      record.onRequestClose = onRequestClose
      records.set(menuId, record)
      if (previous && previousMenuId !== menuId) previous.onRequestClose()
    },
    createMotion: (onPresent) => {
      const controller = createCanvasMenuMotionController({
        onPresent: (presentation) => {
          if (!resetting) onPresent(presentation)
        },
        reducedMotion,
        scheduler
      })
      controllers.add(controller)
      return {
        dispose: () => {
          controllers.delete(controller)
          controller.dispose()
        },
        reset: controller.reset,
        setOpen: controller.setOpen
      }
    },
    deactivate: (menuId) => {
      if (activeMenuId === menuId) activeMenuId = null
    },
    present: (menuId, progress) => {
      const record = records.get(menuId)
      if (record) record.progress = progress
      else records.set(menuId, { onRequestClose: () => undefined, progress })
      updateBackdrop()
    },
    release: (menuId) => {
      records.delete(menuId)
      if (activeMenuId === menuId) activeMenuId = null
      updateBackdrop()
    },
    reset: () => {
      const closeRequests = [...records.values()].map((record) => record.onRequestClose)
      resetting = true
      controllers.forEach((controller) => controller.reset())
      resetting = false
      activeMenuId = null
      records.clear()
      updateBackdrop()
      closeRequests.forEach((close) => close())
    },
    setBackdrop: (element) => {
      backdrop = element
      updateBackdrop()
    }
  }
}

function useCanvasMenuCoordinator(): CanvasMenuCoordinator {
  const coordinator = useContext(CanvasMenuMotionContext)
  const fallbackCoordinator = useMemo(
    () => createCanvasMenuCoordinator({ reducedMotion: prefersReducedMotion() }),
    []
  )
  return coordinator ?? fallbackCoordinator
}

function applyCanvasMenuPresentation(
  surface: HTMLDivElement | null,
  anchor: CanvasMenuAnchor,
  presentation: CanvasMenuMotionPresentation
): void {
  if (!surface) return
  const rect = surface.getBoundingClientRect()
  const originX = clamp(anchor.x - rect.left, 0, rect.width)
  const originY = clamp(anchor.y - rect.top, 0, rect.height)
  const anchorSurfaceX = rect.left + originX
  const anchorSurfaceY = rect.top + originY
  const shiftX = clamp(anchor.x - anchorSurfaceX, -8, 8)
  const shiftY = clamp(anchor.y - anchorSurfaceY, -8, 8)
  const hiddenProgress = 1 - presentation.progress

  surface.dataset.motionState = presentation.phase
  surface.style.setProperty(
    '--canvas-menu-opacity',
    `${round(Math.min(1, presentation.progress * 1.18))}`
  )
  surface.style.setProperty('--canvas-menu-origin-x', `${round(originX)}px`)
  surface.style.setProperty('--canvas-menu-origin-y', `${round(originY)}px`)
  surface.style.setProperty('--canvas-menu-scale', `${round(0.94 + presentation.progress * 0.06)}`)
  surface.style.setProperty('--canvas-menu-translate-x', `${round(shiftX * hiddenProgress)}px`)
  surface.style.setProperty('--canvas-menu-translate-y', `${round(shiftY * hiddenProgress)}px`)
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}
