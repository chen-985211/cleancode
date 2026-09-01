import {
  resolveWorkbenchNodeCreationPlan,
  type WorkbenchCanvasRect,
  type WorkbenchNodePosition,
  type WorkbenchNodeSize,
  type WorkbenchScreenRect
} from './workbenchNodeCreationPolicy'
import type { CanvasViewportSnapshot } from '../../../../contexts/block-graph/application/dto/BlockGraphSnapshot'

interface ReserveWorkbenchNodeCreationInput {
  readonly canvasSize: WorkbenchNodeSize
  readonly currentViewport: CanvasViewportSnapshot
  readonly nodeSize: WorkbenchNodeSize
  readonly occupiedRects: readonly WorkbenchCanvasRect[]
  readonly projectedNodeIds: readonly string[]
  readonly safeViewport: WorkbenchScreenRect
  readonly scopeKey: string
}

export interface WorkbenchNodeCreationReservation {
  readonly position: WorkbenchNodePosition
  readonly reservationId: string
}

interface PendingReservation {
  readonly rect: WorkbenchCanvasRect
  readonly projectedNodeId: string | null
}

export interface WorkbenchNodeCreationCoordinator {
  reserve(input: ReserveWorkbenchNodeCreationInput): WorkbenchNodeCreationReservation
  commit(reservationId: string, projectedNodeId: string): void
  release(reservationId: string): void
  inspectReservations(): readonly WorkbenchCanvasRect[]
}

export function createWorkbenchNodeCreationCoordinator(): WorkbenchNodeCreationCoordinator {
  let activeScopeKey: string | null = null
  let nextReservationId = 1
  const reservations = new Map<string, PendingReservation>()

  const activateScope = (scopeKey: string): void => {
    if (activeScopeKey === scopeKey) {
      return
    }

    activeScopeKey = scopeKey
    reservations.clear()
  }

  return {
    reserve(input) {
      activateScope(input.scopeKey)
      const projectedNodeIds = new Set(input.projectedNodeIds)

      for (const [reservationId, reservation] of reservations) {
        if (reservation.projectedNodeId && projectedNodeIds.has(reservation.projectedNodeId)) {
          reservations.delete(reservationId)
        }
      }

      const plan = resolveWorkbenchNodeCreationPlan({
        canvasSize: input.canvasSize,
        currentViewport: input.currentViewport,
        nodeSize: input.nodeSize,
        occupiedRects: [
          ...input.occupiedRects,
          ...[...reservations.values()].map((reservation) => reservation.rect)
        ],
        safeViewport: input.safeViewport
      })
      const reservationId = `workbench-node-creation-${nextReservationId}`
      nextReservationId += 1
      reservations.set(reservationId, {
        projectedNodeId: null,
        rect: {
          id: reservationId,
          position: plan.position,
          size: { ...input.nodeSize }
        }
      })

      return {
        position: plan.position,
        reservationId
      }
    },

    commit(reservationId, projectedNodeId) {
      const reservation = reservations.get(reservationId)

      if (!reservation) {
        return
      }

      reservations.set(reservationId, {
        ...reservation,
        projectedNodeId
      })
    },

    release(reservationId) {
      reservations.delete(reservationId)
    },

    inspectReservations() {
      return [...reservations.values()].map((reservation) => reservation.rect)
    }
  }
}
