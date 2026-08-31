import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import {
  applicationSettingsPaneEntryOffset,
  createApplicationSettingsPaneMotionController,
  resolveApplicationSettingsPaneDirection,
  type ApplicationSettingsPane,
  type ApplicationSettingsPaneDirection
} from './applicationSettingsPaneMotion'
import { usePrefersReducedMotion } from '../shared/hooks/usePrefersReducedMotion'

interface ApplicationSettingsPaneTransitionProps {
  readonly activePane: ApplicationSettingsPane
  readonly children: ReactNode
}

interface RenderedPaneLayer {
  readonly content: ReactNode | null
  readonly direction: ApplicationSettingsPaneDirection
  readonly id: string
  readonly initialOpacity: number
  readonly initialX: number
  readonly pane: ApplicationSettingsPane
  readonly role: 'current' | 'outgoing'
  readonly targetOpacity: number
  readonly targetX: number
}

interface RenderedPaneState {
  readonly activePane: ApplicationSettingsPane
  readonly direction: ApplicationSettingsPaneDirection
  readonly layers: readonly RenderedPaneLayer[]
  readonly revision: number
}

export function ApplicationSettingsPaneTransition({
  activePane,
  children
}: ApplicationSettingsPaneTransitionProps) {
  const nextLayerIdRef = useRef(1)
  const lastCurrentContentRef = useRef(children)
  const layerRootsRef = useRef(new Map<string, HTMLDivElement>())
  const reducedMotion = usePrefersReducedMotion()
  const controller = useMemo(() => createApplicationSettingsPaneMotionController(), [])
  const [state, setState] = useState<RenderedPaneState>(() => ({
    activePane,
    direction: 'none',
    layers: [createInitialLayer(activePane, children)],
    revision: 0
  }))

  useLayoutEffect(() => {
    if (activePane === state.activePane) {
      lastCurrentContentRef.current = children
      return
    }

    const direction = resolveApplicationSettingsPaneDirection(state.activePane, activePane)
    const directionSign = direction === 'backward' ? -1 : 1
    const outgoingContent = lastCurrentContentRef.current
    const nextLayerId = `${activePane}-${nextLayerIdRef.current}`
    nextLayerIdRef.current += 1
    setState((current) => ({
      activePane,
      direction,
      layers: [
        ...current.layers.map((layer) =>
          layer.role === 'current'
            ? {
                ...layer,
                content: outgoingContent,
                direction,
                role: 'outgoing' as const,
                targetOpacity: 0,
                targetX: -directionSign * applicationSettingsPaneEntryOffset
              }
            : layer
        ),
        {
          content: children,
          direction,
          id: nextLayerId,
          initialOpacity: 0,
          initialX: directionSign * applicationSettingsPaneEntryOffset,
          pane: activePane,
          role: 'current',
          targetOpacity: 1,
          targetX: 0
        }
      ],
      revision: current.revision + 1
    }))
  }, [activePane, children, state.activePane])

  useLayoutEffect(() => {
    const revision = state.revision
    controller.layersChanged(
      state.layers.flatMap((layer) => {
        const root = layerRootsRef.current.get(layer.id)
        return root
          ? [
              {
                id: layer.id,
                initialOpacity: layer.initialOpacity,
                initialX: layer.initialX,
                root,
                targetOpacity: layer.targetOpacity,
                targetX: layer.targetX
              }
            ]
          : []
      }),
      {
        onSettled: () => {
          setState((current) => {
            if (current.revision !== revision || current.layers.length === 1) return current
            return {
              ...current,
              direction: 'none',
              layers: current.layers.filter((layer) => layer.role === 'current')
            }
          })
        },
        reducedMotion: reducedMotion || state.direction === 'none'
      }
    )
  }, [controller, reducedMotion, state.direction, state.layers, state.revision])

  useEffect(() => () => controller.dispose(), [controller])

  return (
    <div
      className="application-settings-pane-transition"
      data-application-settings-pane-direction={state.direction}
    >
      {state.layers.map((layer) => {
        const isCurrent = layer.role === 'current'
        return (
          <div
            key={layer.id}
            ref={(element) => {
              if (element) layerRootsRef.current.set(layer.id, element)
              else layerRootsRef.current.delete(layer.id)
            }}
            className="application-settings-pane-transition__layer"
            data-application-settings-pane={layer.pane}
            data-application-settings-pane-role={layer.role}
            aria-hidden={isCurrent ? undefined : true}
            inert={!isCurrent}
          >
            {isCurrent && layer.pane === activePane ? children : layer.content}
          </div>
        )
      })}
    </div>
  )
}

function createInitialLayer(pane: ApplicationSettingsPane, content: ReactNode): RenderedPaneLayer {
  return {
    content,
    direction: 'none',
    id: `${pane}-0`,
    initialOpacity: 1,
    initialX: 0,
    pane,
    role: 'current',
    targetOpacity: 1,
    targetX: 0
  }
}
