import { NodeResizeControl } from '@xyflow/react'
import type { ComponentProps } from 'react'

import { workbenchNodeResizeHandleStyle } from './workbenchNodeResizeHandle'

type NodeResizeControlProps = ComponentProps<typeof NodeResizeControl>

const workbenchNodeResizePositions = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right'
] as const

export function WorkbenchNodeResizer({
  className,
  isVisible = true,
  minHeight,
  minWidth,
  onResizeEnd,
  onResizeStart
}: {
  readonly className: string
  readonly isVisible?: boolean
  readonly minHeight: number
  readonly minWidth: number
  readonly onResizeEnd?: NodeResizeControlProps['onResizeEnd']
  readonly onResizeStart?: NodeResizeControlProps['onResizeStart']
}) {
  if (!isVisible) return null

  return workbenchNodeResizePositions.map((position) => (
    <NodeResizeControl
      key={position}
      className={className}
      position={position}
      style={workbenchNodeResizeHandleStyle}
      minHeight={minHeight}
      minWidth={minWidth}
      onResizeEnd={onResizeEnd}
      onResizeStart={onResizeStart}
    />
  ))
}
