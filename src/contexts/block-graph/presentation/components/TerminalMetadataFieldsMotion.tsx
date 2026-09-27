import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'

import { useSurfaceMotionPresence } from '../../../../presentation/shared/hooks/useSurfaceMotionPresence'
import { createSpringProgressMotionController } from '../../../../presentation/shared/motion/springProgressMotion'

/** Owns only the editor's local field geometry, never the terminal or canvas layout. */
export function TerminalMetadataFieldsMotion({
  open,
  children,
  className = '',
  contentClassName = ''
}: {
  readonly open: boolean
  readonly children: ReactNode
  readonly className?: string
  readonly contentClassName?: string
}) {
  const presence = useSurfaceMotionPresence(open)
  const rootRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLFieldSetElement>(null)
  const initialOpen = useRef(open)
  const hasPresented = useRef(false)
  const controller = useMemo(
    () =>
      createSpringProgressMotionController({
        dynamics: { dampingRatio: 1, response: 0.28 },
        stateAttribute: 'data-terminal-fields-motion',
        clear: (root) => {
          for (const property of ['height', '--terminal-fields-opacity', '--terminal-fields-y']) {
            root.style.removeProperty(property)
          }
        }
      }),
    []
  )
  const { completeMotion, motionId, reducedMotion } = presence
  useLayoutEffect(() => {
    const root = rootRef.current
    const content = contentRef.current
    let progress = open ? 1 : 0
    let settled = false
    const presentHeight = () => {
      // offsetHeight stays in CSS pixels while the canvas and editor surface are scaled.
      if (root && content) {
        root.style.height = settled ? 'auto' : `${content.offsetHeight * progress}px`
      }
    }
    controller.intentChanged(root, {
      visible: open,
      reducedMotion: reducedMotion || (initialOpen.current && !hasPresented.current),
      onSettled: () => completeMotion(motionId),
      present: (element, value, state) => {
        progress = value
        settled = state === 'open'
        presentHeight()
        element.style.setProperty('--terminal-fields-opacity', String(value))
        element.style.setProperty('--terminal-fields-y', `${-6 * (1 - value)}px`)
      }
    })
    if (root) hasPresented.current = true
    if (!content || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(presentHeight)
    observer.observe(content)
    return () => observer.disconnect()
  }, [completeMotion, controller, motionId, open, reducedMotion])
  useLayoutEffect(
    () => () => {
      controller.dispose()
      hasPresented.current = false
    },
    [controller]
  )
  if (!presence.isPresent) return null
  return (
    <div
      ref={rootRef}
      className={`terminal-metadata-fields-motion ${className}`}
      {...presence.surfaceProps}
    >
      <fieldset
        ref={contentRef}
        className={`terminal-metadata-fields-motion__content ${contentClassName}`}
        disabled={!open}
      >
        {children}
      </fieldset>
    </div>
  )
}
