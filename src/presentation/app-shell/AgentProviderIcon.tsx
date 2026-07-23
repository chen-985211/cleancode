import { Bot } from 'lucide-react'

import type { AgentProviderIcon as AgentProviderIconDescriptor } from '../../contexts/agent/application/ports/AgentProviderContribution'

export function AgentProviderIcon({ icon }: { readonly icon: AgentProviderIconDescriptor | null }) {
  if (!icon) {
    return <Bot aria-hidden="true" className="agent-provider-icon" />
  }

  return (
    <svg
      aria-hidden="true"
      className="agent-provider-icon"
      fill="currentColor"
      focusable="false"
      viewBox={icon.viewBox}
    >
      {icon.paths.map((path, index) => (
        <path
          clipRule={path.fillRule}
          d={path.d}
          fill={path.fill}
          fillRule={path.fillRule}
          key={`${index}:${path.d}`}
        />
      ))}
    </svg>
  )
}
