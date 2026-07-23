import { Bot } from 'lucide-react'
import { useId } from 'react'

import type { AgentProviderIcon as AgentProviderIconDescriptor } from '../../contexts/agent/application/ports/AgentProviderContribution'

export function AgentProviderIcon({ icon }: { readonly icon: AgentProviderIconDescriptor | null }) {
  const definitionPrefix = useId().replaceAll(':', '')

  if (!icon) {
    return <Bot aria-hidden="true" className="agent-provider-icon" />
  }

  if ('imageDataUrl' in icon) {
    return (
      <img
        alt=""
        aria-hidden="true"
        className="agent-provider-icon"
        decoding="async"
        draggable={false}
        src={icon.imageDataUrl}
      />
    )
  }

  return (
    <svg
      aria-hidden="true"
      className="agent-provider-icon"
      fill="currentColor"
      focusable="false"
      viewBox={icon.viewBox}
    >
      {icon.linearGradients ? (
        <defs>
          {icon.linearGradients.map((gradient) => (
            <linearGradient
              id={`${definitionPrefix}-${gradient.id}`}
              key={gradient.id}
              x1={gradient.x1}
              x2={gradient.x2}
              y1={gradient.y1}
              y2={gradient.y2}
            >
              {gradient.stops.map((stop) => (
                <stop
                  key={`${stop.offset}:${stop.stopColor}`}
                  offset={stop.offset}
                  stopColor={stop.stopColor}
                />
              ))}
            </linearGradient>
          ))}
        </defs>
      ) : null}
      {icon.paths.map((path, index) => (
        <path
          clipRule={path.fillRule}
          d={path.d}
          fill={resolveIconFill(path.fill, definitionPrefix)}
          fillRule={path.fillRule}
          key={`${index}:${path.d}`}
          transform={path.transform}
        />
      ))}
    </svg>
  )
}

function resolveIconFill(
  fill: 'currentColor' | `#${string}` | `url(#${string})` | undefined,
  definitionPrefix: string
): string | undefined {
  const gradient = fill?.match(/^url\(#(.+)\)$/)
  return gradient ? `url(#${definitionPrefix}-${gradient[1]})` : fill
}
