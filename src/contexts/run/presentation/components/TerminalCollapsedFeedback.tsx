import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

import { useI18n } from '../../../../presentation/i18n/useI18n'
import { usePrefersReducedMotion } from '../../../../presentation/shared/hooks/usePrefersReducedMotion'
import { WorkbenchIcon } from '../../../../presentation/shared/components/WorkbenchIcons'
import type { WorkflowRunNodeStatus } from '../../application/dto/WorkflowRunSnapshot'
import type { TerminalViewState } from '../view-models/TerminalPresentationTypes'
import { terminalCollapsedFeedback } from '../view-models/terminalCollapsedFeedback'
import { createTerminalProgressMotion } from '../view-models/terminalProgressMotion'
import '../styles/terminal-collapsed-feedback.css'

type Glyph = 'tool' | 'check' | 'retry'

// Paths and roll/fill/shake behavior from React Bits Call Chip (MIT).
// https://reactbits.dev/micro/call-chip
const checkPath = 'M5 14L8.5 17.5L19 6.5'
const retryPath =
  'M20.0092 2V5.13219C20.0092 5.42605 19.6418 5.55908 19.4537 5.33333C17.6226 3.2875 14.9617 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12'
const glyphs: readonly Glyph[] = ['tool', 'check', 'retry']

export function TerminalCollapsedFeedback({
  name,
  session,
  workflowStatus,
  surfaceRef,
  visible = true
}: {
  readonly name: string
  readonly session: TerminalViewState
  readonly workflowStatus: WorkflowRunNodeStatus | undefined
  readonly surfaceRef: RefObject<HTMLDivElement | null>
  readonly visible?: boolean
}) {
  const { t } = useI18n()
  const { status, labelKey } = terminalCollapsedFeedback(session, workflowStatus)
  const reducedMotion = usePrefersReducedMotion()
  const statusLabel = t('terminal.collapsedStatus', { name, status: t(labelKey) })
  const glyph: Glyph = status === 'done' ? 'check' : status === 'error' ? 'retry' : 'tool'
  const [roll, setRoll] = useState<{ current: Glyph; previous: Glyph | null }>({
    current: glyph,
    previous: null
  })
  if (roll.current !== glyph) setRoll({ current: glyph, previous: roll.current })
  const fillRef = useRef<HTMLSpanElement>(null)
  const [progressMotion] = useState(createTerminalProgressMotion)
  const previousStatus = useRef(status)

  useLayoutEffect(() => {
    progressMotion.update(fillRef.current, { status, visible, reducedMotion })
  }, [progressMotion, status, visible, reducedMotion])
  useLayoutEffect(() => () => progressMotion.dispose(), [progressMotion])

  useLayoutEffect(() => {
    const previous = previousStatus.current
    previousStatus.current = status
    const surface = surfaceRef.current
    if (
      status !== 'error' ||
      previous === 'error' ||
      !visible ||
      reducedMotion ||
      !surface?.animate
    )
      return
    const animation = surface.animate(
      [0, -1, 1, -0.66, 0.66, -0.33, 0].map((value) => ({
        transform: `translateX(${value * 6}px)`,
        easing: 'cubic-bezier(0.77, 0, 0.175, 1)'
      })),
      { duration: 450, composite: 'add' }
    )
    return () => animation.cancel()
  }, [status, visible, reducedMotion, surfaceRef])

  return (
    <span
      className="terminal-collapsed-feedback terminal-node__icon"
      role="status"
      aria-label={statusLabel}
      aria-busy={status === 'running'}
      data-status={status}
      data-reduced-motion={reducedMotion}
      hidden={!visible}
    >
      <span ref={fillRef} className="terminal-collapsed-feedback__fill" aria-hidden="true" />
      <span className="terminal-collapsed-feedback__slot" aria-hidden="true">
        {glyphs.map((item) => (
          <span
            key={item}
            className="terminal-collapsed-feedback__glyph"
            data-glyph={item}
            data-state={item === roll.current ? 'in' : item === roll.previous ? 'out' : undefined}
          >
            {item === 'tool' ? (
              <WorkbenchIcon role="terminal" size={17} />
            ) : (
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={item === 'check' ? 2.2 : item === 'retry' ? 2 : 1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={item === 'check' ? checkPath : retryPath} />
              </svg>
            )}
          </span>
        ))}
      </span>
      {visible ? (
        <span className="terminal-collapsed-feedback__announcement">{t(labelKey)}</span>
      ) : null}
    </span>
  )
}
