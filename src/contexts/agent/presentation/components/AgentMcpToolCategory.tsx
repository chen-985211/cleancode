import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight'
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { agentMcpToolCatalog } from '../../application/dto/AgentMcpToolCatalog'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import { ApplicationSettingsSwitch } from '../../../../presentation/shared/components/ApplicationSettingsSwitch'
import { useSurfaceMotionPresence } from '../../../../presentation/shared/hooks/useSurfaceMotionPresence'
import { createSpringProgressMotionController } from '../../../../presentation/shared/motion/springProgressMotion'

export function AgentMcpToolCategory({
  category,
  checked,
  disabled,
  pending,
  onToggle
}: {
  readonly category: (typeof agentMcpToolCatalog)[number]
  readonly checked: boolean
  readonly disabled: boolean
  readonly pending: boolean
  readonly onToggle: () => void
}) {
  const { t } = useI18n()
  const id = useId()
  const [expanded, setExpanded] = useState(false)
  const presence = useSurfaceMotionPresence(expanded)
  const rootRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const controller = useMemo(
    () =>
      createSpringProgressMotionController({
        dynamics: { dampingRatio: 1, response: 0.34 },
        stateAttribute: 'data-mcp-tools-motion',
        clear: (root) => {
          for (const property of ['height', 'opacity', 'y', 'progress']) {
            root.style.removeProperty(`--mcp-tool-list-${property}`)
          }
        }
      }),
    []
  )
  const { completeMotion, motionId, reducedMotion } = presence
  useLayoutEffect(() => {
    const root = rootRef.current
    const list = listRef.current
    let progress = expanded ? 1 : 0
    let settled = false
    const updateHeight = () => {
      if (root && list) {
        root.style.setProperty(
          '--mcp-tool-list-height',
          settled ? 'auto' : `${list.offsetHeight * progress}px`
        )
      }
    }
    controller.intentChanged(root, {
      visible: expanded,
      reducedMotion,
      onSettled: () => completeMotion(motionId),
      present: (element, value, state) => {
        progress = value
        settled = state === 'open'
        updateHeight()
        element.style.setProperty('--mcp-tool-list-opacity', String(value))
        element.style.setProperty('--mcp-tool-list-y', `${-6 * (1 - value)}px`)
        element.style.setProperty('--mcp-tool-list-progress', String(value))
      }
    })
    if (!list || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateHeight)
    observer.observe(list)
    return () => observer.disconnect()
  }, [completeMotion, controller, expanded, motionId, reducedMotion])
  useLayoutEffect(() => () => controller.dispose(), [controller])

  return (
    <section ref={rootRef} className="mcp-settings-category" aria-labelledby={`${id}-heading`}>
      <header>
        <h3 id={`${id}-heading`}>
          <button
            className="mcp-settings-category__disclosure"
            type="button"
            aria-expanded={expanded}
            aria-controls={`${id}-tools`}
            onClick={() => setExpanded((current) => !current)}
          >
            <CaretRightIcon size={14} weight="bold" aria-hidden="true" />
            <span>{t(`settings.mcp.${category.id}`)}</span>
            <span className="mcp-settings-category__count">
              {t('settings.mcp.toolCount', { count: category.tools.length })}
            </span>
          </button>
        </h3>
        <ApplicationSettingsSwitch
          checked={checked}
          disabled={disabled}
          aria-disabled={pending || undefined}
          label={t(`settings.mcp.${category.id}`)}
          onClick={onToggle}
        />
      </header>
      <div
        className="mcp-settings-category__body"
        hidden={!presence.isPresent}
        {...presence.surfaceProps}
      >
        <ul ref={listRef} id={`${id}-tools`}>
          {category.tools.map((name) => (
            <li key={name}>
              <code>{name}</code>
              <span>{t(`settings.mcp.tool.${name}`)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
