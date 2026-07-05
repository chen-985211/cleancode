import type { SVGProps } from 'react'

export type TerminalNodeIconName =
  'check' | 'close' | 'delete' | 'edit' | 'restart' | 'stop' | 'terminal'

interface TerminalNodeIconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  readonly name: TerminalNodeIconName
  readonly size?: number
}

export function TerminalNodeIcon({ name, size = 18, className, ...props }: TerminalNodeIconProps) {
  const iconClassName = ['terminal-node-icon', className].filter(Boolean).join(' ')

  return (
    <svg
      className={iconClassName}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {renderTerminalNodeIcon(name)}
    </svg>
  )
}

function renderTerminalNodeIcon(name: TerminalNodeIconName) {
  switch (name) {
    case 'check':
      return (
        <g {...etchedStrokeProps}>
          <path d="m5.1 10.35 3.05 2.95 6.7-6.55" />
        </g>
      )
    case 'close':
      return (
        <g {...etchedStrokeProps}>
          <path d="m6.35 6.35 7.3 7.3" />
          <path d="m13.65 6.35-7.3 7.3" />
        </g>
      )
    case 'delete':
      return (
        <g {...etchedStrokeProps}>
          <path d="M6.35 7.35h7.3" />
          <path d="M8.55 6.05h2.9" />
          <path d="m7.25 8.85.42 4.75c.08.88.7 1.45 1.57 1.45h1.52c.87 0 1.49-.57 1.57-1.45l.42-4.75" />
        </g>
      )
    case 'edit':
      return (
        <g {...etchedStrokeProps}>
          <path d="m6.15 13.85.58-2.35 5.94-5.94a1.18 1.18 0 0 1 1.68 1.67L8.4 13.17l-2.25.68Z" />
          <path d="m11.75 6.55 1.7 1.7" />
        </g>
      )
    case 'restart':
      return (
        <g {...etchedStrokeProps}>
          <path d="M14.35 8.2V5.55h-2.65" />
          <path d="M14.1 5.85a5.1 5.1 0 1 0 .68 6.06" />
        </g>
      )
    case 'stop':
      return (
        <rect
          x="6.65"
          y="6.65"
          width="6.7"
          height="6.7"
          rx="1.45"
          fill="currentColor"
          opacity="0.92"
        />
      )
    case 'terminal':
      return (
        <g {...etchedStrokeProps} strokeWidth="1.8">
          <path d="m5.45 6.15 3.35 3.35-3.35 3.35" />
          <path d="M10.9 13.05h3.7" />
        </g>
      )
  }
}

const etchedStrokeProps = {
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeWidth: 1.72,
  vectorEffect: 'non-scaling-stroke'
} as const
