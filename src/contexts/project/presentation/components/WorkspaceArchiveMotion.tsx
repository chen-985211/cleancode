import {
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
  type Ref
} from 'react'

import { usePrefersReducedMotion } from '../../../../presentation/shared/hooks/usePrefersReducedMotion'
import { createSpringProgressMotionController } from '../../../../presentation/shared/motion/springProgressMotion'
import { createWorkspaceArchiveFillMotion } from '../motion/workspaceArchiveFillMotion'

interface WorkspaceArchiveMotionProps {
  readonly children: ReactNode
  readonly workspaceId: string
  readonly present: boolean
  readonly archiving: boolean
  readonly rootRef?: Ref<HTMLDivElement>
  readonly onExit: (workspaceId: string) => void
  readonly onLayoutChange: () => void
}

export function WorkspaceArchiveMotion({
  children,
  workspaceId,
  present,
  archiving,
  rootRef,
  onExit,
  onLayoutChange
}: WorkspaceArchiveMotionProps) {
  const root = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const fill = useRef<HTMLSpanElement>(null)
  const initialized = useRef(false)
  const reduced = usePrefersReducedMotion()
  useImperativeHandle(rootRef, () => root.current as HTMLDivElement, [])
  const fillController = useMemo(() => createWorkspaceArchiveFillMotion(), [])
  const controller = useMemo(
    () =>
      createSpringProgressMotionController({
        dynamics: { dampingRatio: 1, response: 0.32 },
        stateAttribute: 'data-workspace-row-motion',
        clear: (element) => {
          element.style.removeProperty('height')
          element.style.removeProperty('--workspace-archive-layout')
          element.style.removeProperty('--workspace-archive-presence')
          element.style.removeProperty('--workspace-archive-shift')
        }
      }),
    []
  )

  useLayoutEffect(() => {
    const height = content.current?.offsetHeight ?? 0
    if (!present && root.current?.contains(document.activeElement)) {
      root.current
        .closest('.project-card')
        ?.querySelector<HTMLButtonElement>('.project-card__select')
        ?.focus()
    }
    const showRow = (visible: boolean): void => {
      controller.intentChanged(root.current, {
        visible,
        reducedMotion: reduced || !initialized.current,
        onSettled: () => {
          if (!present) onExit(workspaceId)
        },
        present: (element, progress, state) => {
          const layout = Math.min(1, progress / 0.6)
          const surface = Math.max(0, (progress - 0.55) / 0.45)
          element.style.setProperty('height', state === 'open' ? 'auto' : `${height * layout}px`)
          element.style.setProperty('--workspace-archive-layout', `${layout}`)
          element.style.setProperty('--workspace-archive-presence', `${surface}`)
          element.style.setProperty('--workspace-archive-shift', `${-28 * (1 - surface)}px`)
          onLayoutChange()
        }
      })
    }
    if (present) showRow(true)
    fillController.intentChanged(fill.current, {
      pending: archiving,
      present,
      reducedMotion: reduced,
      onFilled: () => showRow(false)
    })
    initialized.current = true
  }, [archiving, controller, fillController, onExit, onLayoutChange, present, reduced, workspaceId])

  useLayoutEffect(
    () => () => {
      fillController.dispose()
      controller.dispose()
      initialized.current = false
    },
    [controller, fillController]
  )

  return (
    <div
      ref={root}
      className="workspace-group workspace-archive-row"
      data-selection-motion-option={present ? workspaceId : undefined}
      data-workspace-archive-state={!present ? 'exiting' : archiving ? 'pending' : 'idle'}
      aria-busy={(archiving && present) || undefined}
      aria-hidden={!present || undefined}
      inert={!present}
    >
      <div ref={content} className="workspace-archive-row__surface">
        {archiving || !present ? (
          <span className="workspace-archive-row__liquid" aria-hidden="true">
            <span ref={fill} className="workspace-archive-row__liquid-surface" />
          </span>
        ) : null}
        {children}
      </div>
    </div>
  )
}
