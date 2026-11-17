import { AgentDomainError } from '../../../src/contexts/agent/domain/errors/AgentDomainError'
import { RunDomainError } from '../../../src/contexts/run/domain/errors/RunDomainError'
import { CanvasArrangementDomainError } from '../../../src/contexts/canvas-arrangement/domain/errors/CanvasArrangementDomainError'
import { BlockGraphDomainError } from '../../../src/contexts/block-graph/domain/errors/BlockGraphDomainError'
import { ProjectDomainError } from '../../../src/contexts/project/domain/errors/ProjectDomainError'
import { ProjectRegistry } from '../../../src/contexts/project/domain/aggregates/ProjectRegistry'
import { resolveTerminalRemovalBlockIds } from '../../../src/contexts/block-graph/domain/services/TerminalRemovalRules'
import { CanvasArrangement } from '../../../src/contexts/canvas-arrangement/domain/aggregates/CanvasArrangement'
import { AgentSession } from '../../../src/contexts/agent/domain/aggregates/AgentSession'
import { validateServicePortIntent } from '../../../src/contexts/run/domain/value-objects/ServicePortIntent'
import {
  isAppError,
  serializeAppError,
  createClientAppError
} from '../../../src/shared-kernel/application/errors/AppError'

describe('context domain errors across the application boundary', () => {
  it.each([
    [
      'project',
      ProjectDomainError,
      'PROJECT_NOT_REMEMBERED',
      () => ProjectRegistry.empty().selectCurrentProject('/missing')
    ],
    [
      'block-graph',
      BlockGraphDomainError,
      'TERMINAL_BLOCK_NOT_FOUND',
      () =>
        resolveTerminalRemovalBlockIds({ type: 'terminal', terminalBlockId: 'missing' }, [], [], [])
    ],
    [
      'canvas-arrangement',
      CanvasArrangementDomainError,
      'CANVAS_STACK_NOT_FOUND',
      () => CanvasArrangement.create({ projectId: 'p', workspaceId: 'w' }).removeStack('missing')
    ],
    [
      'agent',
      AgentDomainError,
      'AGENT_SESSION_INVALID',
      () =>
        AgentSession.create({
          agentId: 'a',
          projectId: 'p',
          workspaceId: 'w',
          providerId: 'provider',
          name: '',
          layout: { position: { x: 0, y: 0 }, size: { width: 720, height: 460 } }
        })
    ],
    [
      'run',
      RunDomainError,
      'TERMINAL_EXECUTION_CONFIG_INVALID',
      () =>
        validateServicePortIntent({
          protocol: 'http',
          policy: { type: 'fixed', port: 0 },
          binding: { type: 'none' }
        })
    ]
  ] as const)(
    'keeps %s ownership while preserving its public error envelope',
    (context, ErrorClass, code, run) => {
      let failure: unknown
      try {
        run()
      } catch (error) {
        failure = error
      }
      expect(failure).toBeInstanceOf(ErrorClass)
      expect(failure).toMatchObject({ context, name: ErrorClass.name, code, isExpected: true })
      if (!isAppError(failure)) throw new Error('Expected a structured application error.')
      const serialized = serializeAppError(failure, { correlationId: 'operation-1' })
      expect(serialized).toEqual({
        code,
        message: failure.message,
        isExpected: true,
        details: failure.details,
        correlationId: 'operation-1'
      })
      expect(serialized).not.toHaveProperty('context')
      expect(createClientAppError(serialized)).toMatchObject({ code, correlationId: 'operation-1' })
    }
  )
})
