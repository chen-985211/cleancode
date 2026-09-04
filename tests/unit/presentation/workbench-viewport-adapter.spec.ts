import type { Edge, ReactFlowInstance, Viewport } from '@xyflow/react'

import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import {
  applyWorkbenchViewport,
  isApplyingWorkbenchViewport
} from '../../../src/presentation/app-shell/workbench/viewport/workbenchViewportAdapter'

describe('workbench viewport adapter', () => {
  it.each(['success', 'refused', 'throw', 'reject'] as const)(
    'clears frame ownership after %s without marking another canvas',
    async (outcome) => {
      const otherInstance = {} as ReactFlowInstance<WorkbenchFlowNode, Edge>
      let sourceAtMoveStart = false
      const instance = {
        setViewport: () => {
          sourceAtMoveStart = isApplyingWorkbenchViewport(instance)
          expect(isApplyingWorkbenchViewport(otherInstance)).toBe(false)
          if (outcome === 'throw') throw new Error('viewport unavailable')
          if (outcome === 'reject') return Promise.reject(new Error('viewport unavailable'))
          return Promise.resolve(outcome === 'success')
        }
      } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
      const viewport: Viewport = { x: 0, y: 0, zoom: 1.25 }

      expect(isApplyingWorkbenchViewport(instance)).toBe(false)
      const applied = applyWorkbenchViewport(instance, viewport)
      expect(sourceAtMoveStart).toBe(true)
      expect(isApplyingWorkbenchViewport(instance)).toBe(false)
      expect(await applied).toBe(outcome === 'success')
      expect(isApplyingWorkbenchViewport(instance)).toBe(false)
    }
  )
})
