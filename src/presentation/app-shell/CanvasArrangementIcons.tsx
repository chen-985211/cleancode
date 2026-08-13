import { forwardRef } from 'react'

import type { Icon, IconProps } from '@phosphor-icons/react'

function createCanvasArrangementIcon(variant: 'stack' | 'unstack'): Icon {
  const CanvasArrangementIcon = forwardRef<SVGSVGElement, IconProps>((props, ref) => {
    const { color = 'currentColor', size = '1em' } = props
    const svgProps = { ...props }
    delete svgProps.alt
    delete svgProps.color
    delete svgProps.mirrored
    delete svgProps.size
    delete svgProps.weight

    return (
      <svg
        {...svgProps}
        ref={ref}
        color={color}
        fill="none"
        height={size}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        viewBox="0 0 24 24"
        width={size}
        xmlns="http://www.w3.org/2000/svg"
      >
        <g transform="rotate(-2.5 12 12)">
          <path
            d="M9.35 3H18.1C19.95 3 21 4.05 21 5.9V14.1C21 15.95 19.95 17 18.1 17H17"
            data-canvas-card="back"
            strokeWidth="1.7"
          />
          <path d="M7 7.1V5.9C7 4.05 8.05 3 9.9 3" data-canvas-card-layer strokeWidth="1.7" />
          <rect
            data-canvas-card="front"
            height="14"
            rx="2.65"
            strokeWidth="1.7"
            width="14"
            x="3"
            y="7"
          />
        </g>
        {variant === 'unstack' ? (
          <path d="M2.8 21.2 21.2 2.8" data-canvas-unstack-slash strokeWidth="2.1" />
        ) : null}
      </svg>
    )
  })

  CanvasArrangementIcon.displayName =
    variant === 'stack' ? 'CanvasArrangementStackIcon' : 'CanvasArrangementUnstackIcon'

  return CanvasArrangementIcon
}

export const CanvasArrangementStackIcon = createCanvasArrangementIcon('stack')
export const CanvasArrangementUnstackIcon = createCanvasArrangementIcon('unstack')
