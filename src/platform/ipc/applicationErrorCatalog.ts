import { commonErrorCodes, isCommonErrorCode } from '../../shared-kernel/domain/errors/AppError'
import {
  projectErrorCodes,
  isProjectErrorCode
} from '../../contexts/project/application/errors/ProjectErrors'
import {
  blockGraphErrorCodes,
  isBlockGraphErrorCode
} from '../../contexts/block-graph/application/errors/BlockGraphErrors'
import {
  canvasArrangementErrorCodes,
  isCanvasArrangementErrorCode
} from '../../contexts/canvas-arrangement/application/errors/CanvasArrangementErrors'
import { runErrorCodes, isRunErrorCode } from '../../contexts/run/application/errors/RunErrors'
import {
  agentErrorCodes,
  isAgentErrorCode
} from '../../contexts/agent/application/errors/AgentErrors'
import { ipcErrorCodes } from './IpcError'

export const registeredApplicationErrorCodes = [
  ...commonErrorCodes,
  ...projectErrorCodes,
  ...blockGraphErrorCodes,
  ...canvasArrangementErrorCodes,
  ...runErrorCodes,
  ...agentErrorCodes,
  ...ipcErrorCodes
] as const

export function isRegisteredApplicationErrorCode(code: unknown): boolean {
  return (
    isCommonErrorCode(code) ||
    isProjectErrorCode(code) ||
    isBlockGraphErrorCode(code) ||
    isCanvasArrangementErrorCode(code) ||
    isRunErrorCode(code) ||
    isAgentErrorCode(code) ||
    ipcErrorCodes.some((candidate) => candidate === code)
  )
}
