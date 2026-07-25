import { useId } from 'react'

import type { AgentMcpPresentationStatus } from './agentProviderFeedback'
import { useI18n } from './i18n/useI18n'
import { TooltipLabel } from './Tooltip'

export function AgentMcpCapabilityToggle({
  enabled,
  onChange,
  pending,
  status = null
}: {
  readonly enabled: boolean
  readonly onChange: (enabled: boolean) => void
  readonly pending: boolean
  readonly status?: AgentMcpPresentationStatus | null
}) {
  const { t } = useI18n()
  const statusDescriptionId = useId()
  const capabilityTooltip = t('agent.mcpTooltip')
  const visibleStatus = enabled ? status : null
  const statusLabel = visibleStatus ? t(`agent.mcpStatus.${visibleStatus}`) : null
  return (
    <span className="agent-mcp-capability nodrag">
      <TooltipLabel
        content={
          statusLabel ? (
            <span className="agent-mcp-capability__tooltip">
              <strong>{statusLabel}</strong>
              <span>{capabilityTooltip}</span>
            </span>
          ) : (
            capabilityTooltip
          )
        }
        side="bottom"
      >
        <button
          className="agent-mcp-capability__switch nodrag"
          type="button"
          role="switch"
          aria-busy={pending}
          aria-checked={enabled}
          aria-describedby={statusLabel ? statusDescriptionId : undefined}
          aria-label={t('agent.mcpName')}
          disabled={pending}
          onClick={(event) => {
            event.stopPropagation()
            onChange(!enabled)
          }}
        >
          <span className="agent-mcp-capability__icon-wrap" aria-hidden="true">
            <McpGlyph />
            {visibleStatus ? (
              <span className="agent-mcp-capability__status-dot" data-state={visibleStatus} />
            ) : null}
          </span>
          <span className="agent-mcp-capability__label">{t('agent.mcpName')}</span>
          <span className="agent-mcp-capability__track" aria-hidden="true">
            <span className="agent-mcp-capability__thumb" />
          </span>
        </button>
      </TooltipLabel>
      {statusLabel ? (
        <span className="sr-only" id={statusDescriptionId}>
          {statusLabel}
        </span>
      ) : null}
    </span>
  )
}

function McpGlyph() {
  return (
    <svg
      className="agent-mcp-capability__icon"
      viewBox="0 0 195 195"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="12"
      aria-hidden="true"
    >
      <path d="M25 97.8528L92.8823 29.9706C102.255 20.598 117.451 20.598 126.823 29.9706C136.196 39.3431 136.196 54.5391 126.823 63.9117L75.5581 115.177" />
      <path d="M76.2653 114.47L126.823 63.9117C136.196 54.5391 151.392 54.5391 160.765 63.9117L161.118 64.2652C170.491 73.6378 170.491 88.8338 161.118 98.2063L99.7248 159.6C96.6006 162.724 96.6006 167.789 99.7248 170.913L112.331 183.52" />
      <path d="M109.853 46.9411L59.6482 97.1457C50.2757 106.518 50.2757 121.714 59.6482 131.087C69.0208 140.459 84.2168 140.459 93.5894 131.087L143.794 80.8822" />
    </svg>
  )
}
