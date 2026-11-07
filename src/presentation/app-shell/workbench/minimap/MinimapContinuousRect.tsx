import type { SVGAttributes } from 'react'

interface MinimapContinuousRectProps extends Omit<
  SVGAttributes<SVGElement>,
  'x' | 'y' | 'width' | 'height' | 'rx'
> {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rx: number
}

// Chromium's two-cubic CSS squircle approximation, with superellipse exponent 4.
// https://developer.chrome.com/blog/implementing-corner-shape#closed_form_formula
const cornerMidpoint = Math.pow(0.5, 0.25)
const firstControl = 0.4400527608261205
const midpointControl = 0.16052363855369084
const cornerPoints = [
  [firstControl, 0],
  [cornerMidpoint - midpointControl, 1 - cornerMidpoint - midpointControl],
  [cornerMidpoint, 1 - cornerMidpoint],
  [cornerMidpoint + midpointControl, 1 - cornerMidpoint + midpointControl],
  [1, 1 - firstControl],
  [1, 1]
] as const

export function MinimapContinuousRect({
  x,
  y,
  width,
  height,
  rx,
  ...appearance
}: MinimapContinuousRectProps) {
  const originalRadius = Math.max(0, rx)
  // Preserve existing SVG circles, capsules and empty rectangles verbatim.
  if (originalRadius === 0 || originalRadius * 2 >= Math.min(width, height)) {
    return <rect {...appearance} x={x} y={y} width={width} height={height} rx={originalRadius} />
  }

  // Match the original circular cut-in at 45deg, as --cc-corner-radius-scale does in CSS.
  const radius = Math.min(originalRadius * (1 + cornerMidpoint), width / 2, height / 2)
  const right = x + width
  const bottom = y + height
  const corners = [
    [right - radius, y, 1, 0],
    [right, bottom - radius, 0, 1],
    [x + radius, bottom, -1, 0],
    [x, y + radius, 0, -1]
  ] as const
  const path = [`M ${coordinate(x + radius)} ${coordinate(y)}`]
  for (const [originX, originY, directionX, directionY] of corners) {
    const points = cornerPoints.map(([u, v]) =>
      [
        originX + radius * (u * directionX - v * directionY),
        originY + radius * (u * directionY + v * directionX)
      ]
        .map(coordinate)
        .join(' ')
    )
    path.push(
      `L ${coordinate(originX)} ${coordinate(originY)}`,
      `C ${points.slice(0, 3).join(' ')}`,
      `C ${points.slice(3).join(' ')}`
    )
  }
  path.push('Z')
  return <path {...appearance} d={path.join(' ')} />
}

function coordinate(value: number): string {
  return String(Math.round(value * 10_000) / 10_000)
}
