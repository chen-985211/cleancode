import {
  commonErrorCodes,
  isCommonErrorCode,
  isErrorCode
} from '../../../src/shared-kernel/domain/errors/AppError'
import {
  createExpectedAppError,
  isSerializedAppError,
  serializeAppError
} from '../../../src/shared-kernel/application/errors/AppError'
import {
  projectErrorCodes,
  ProjectApplicationError,
  createProjectError
} from '../../../src/contexts/project/application/errors/ProjectErrors'
import {
  blockGraphErrorCodes,
  BlockGraphApplicationError,
  createBlockGraphError
} from '../../../src/contexts/block-graph/application/errors/BlockGraphErrors'
import {
  canvasArrangementErrorCodes,
  CanvasArrangementApplicationError,
  createCanvasArrangementError
} from '../../../src/contexts/canvas-arrangement/application/errors/CanvasArrangementErrors'
import {
  agentErrorCodes,
  AgentApplicationError,
  createAgentError
} from '../../../src/contexts/agent/application/errors/AgentErrors'
import {
  runErrorCodes,
  RunApplicationError,
  createRunError,
  isRunErrorCode
} from '../../../src/contexts/run/application/errors/RunErrors'
import {
  registeredApplicationErrorCodes,
  isRegisteredApplicationErrorCode
} from '../../../src/platform/ipc/applicationErrorCatalog'
import { registerIpcHandler, type IpcMainLike } from '../../../src/platform/ipc/registerIpcHandler'
import { legacyApplicationErrorCodes } from '../../fixtures/applicationErrorCodes'
import { ipcErrorCodes } from '../../../src/platform/ipc/IpcError'
import type * as ProjectErrorModule from '../../../src/contexts/project/application/errors/ProjectErrors'

// A context may contribute new codes without rewriting the published compatibility baseline.
vi.mock(
  '../../../src/contexts/project/application/errors/ProjectErrors',
  async (importOriginal) => {
    const actual = await importOriginal<typeof ProjectErrorModule>()
    return {
      ...actual,
      projectErrorCodes: [...actual.projectErrorCodes, 'PROJECT_ADDITIVE_FAILURE'],
      isProjectErrorCode: (code: unknown) =>
        code === 'PROJECT_ADDITIVE_FAILURE' || actual.isProjectErrorCode(code)
    }
  }
)

describe('application error catalog composition', () => {
  it('accepts an additive context code through the composed catalog', () => {
    expect(isRegisteredApplicationErrorCode('PROJECT_ADDITIVE_FAILURE')).toBe(true)
  })

  it('preserves every published wire code while contexts own their declarations', () => {
    for (const code of legacyApplicationErrorCodes) {
      expect(registeredApplicationErrorCodes).toContain(code)
      expect(isRegisteredApplicationErrorCode(code), code).toBe(true)
    }
  })

  it('registers every current declaration with a valid code and matching validator', () => {
    const declarations = [
      ...commonErrorCodes,
      ...projectErrorCodes,
      ...blockGraphErrorCodes,
      ...canvasArrangementErrorCodes,
      ...runErrorCodes,
      ...agentErrorCodes,
      ...ipcErrorCodes
    ]
    expect(new Set(registeredApplicationErrorCodes)).toEqual(new Set(declarations))
    for (const code of declarations) {
      expect(isErrorCode(code), code).toBe(true)
      expect(isRegisteredApplicationErrorCode(code), code).toBe(true)
    }
  })

  it('keeps context and protocol vocabularies out of the common catalog', () => {
    const contextCodes = [
      ...projectErrorCodes,
      ...blockGraphErrorCodes,
      ...canvasArrangementErrorCodes,
      ...agentErrorCodes,
      ...runErrorCodes,
      ...ipcErrorCodes
    ]
    expect(contextCodes.every((code) => !isCommonErrorCode(code))).toBe(true)
    expect(commonErrorCodes.every(isRegisteredApplicationErrorCode)).toBe(true)
  })

  it('limits repeated public names to explicit legacy compatibility aliases', () => {
    const declarations = [
      ['project', projectErrorCodes],
      ['block-graph', blockGraphErrorCodes],
      ['canvas-arrangement', canvasArrangementErrorCodes],
      ['agent', agentErrorCodes],
      ['run', runErrorCodes],
      ['ipc', ipcErrorCodes],
      ['common', commonErrorCodes]
    ] as const
    const owners = new Map<string, string[]>()
    for (const [context, codes] of declarations) {
      for (const code of codes) owners.set(code, [...(owners.get(code) ?? []), context])
    }
    const aliases = Object.fromEntries(
      [...owners]
        .filter(([, contexts]) => contexts.length > 1)
        .map(([code, contexts]) => [code, contexts.sort()])
    )
    expect(aliases).toEqual({
      TERMINAL_BLOCK_NOT_FOUND: ['agent', 'block-graph', 'run'],
      TERMINAL_EXECUTION_CONFIG_INVALID: ['block-graph', 'run'],
      TERMINAL_RUNTIME_NOT_READY: ['agent', 'run'],
      TERMINAL_SESSION_NOT_FOUND: ['agent', 'run'],
      TERMINAL_WORKFLOW_EMPTY: ['block-graph', 'run'],
      WORKSPACE_INITIALIZATION_CONFLICT: ['block-graph', 'project']
    })
  })

  it('keeps Provider RPC validation scoped to Run and common failures', () => {
    const unrelated = serializeAppError(
      createProjectError('GITHUB_REQUEST_FAILED', 'Request failed.')
    )
    expect(isSerializedAppError(unrelated, isRegisteredApplicationErrorCode)).toBe(true)
    expect(isSerializedAppError(unrelated, isRunErrorCode)).toBe(false)
  })

  it.each([
    [ProjectApplicationError, () => createProjectError('GITHUB_REQUEST_FAILED', 'Request failed.')],
    [
      BlockGraphApplicationError,
      () => createBlockGraphError('BLOCK_GRAPH_SNAPSHOT_CORRUPTED', 'Store corrupt.')
    ],
    [
      CanvasArrangementApplicationError,
      () => createCanvasArrangementError('CANVAS_ARRANGEMENT_CORRUPTED', 'Store corrupt.')
    ],
    [
      AgentApplicationError,
      () => createAgentError('AGENT_PROVIDER_UNAVAILABLE', 'Provider unavailable.')
    ],
    [
      RunApplicationError,
      () => createRunError('TERMINAL_PROVIDER_UNAVAILABLE', 'Provider unavailable.')
    ]
  ] as const)('preserves the %s application failure family', (ErrorClass, create) => {
    const error = create()
    expect(error).toBeInstanceOf(ErrorClass)
    expect(isSerializedAppError(serializeAppError(error), isRegisteredApplicationErrorCode)).toBe(
      true
    )
  })

  it.each([
    [
      ProjectApplicationError,
      () => createProjectError('PROJECT_NOT_REMEMBERED', 'The query scope is unavailable.')
    ],
    [
      BlockGraphApplicationError,
      () => createBlockGraphError('BLOCK_TEMPLATE_INVALID', 'The imported template is invalid.')
    ],
    [
      CanvasArrangementApplicationError,
      () =>
        createCanvasArrangementError(
          'CANVAS_ARRANGEMENT_INVALID',
          'The submitted scope is invalid.'
        )
    ],
    [
      AgentApplicationError,
      () =>
        createAgentError('AGENT_SESSION_INVALID', 'The Provider launch configuration is invalid.')
    ],
    [
      RunApplicationError,
      () => createRunError('TERMINAL_SESSION_NOT_RUNNING', 'The remote PTY is not running.')
    ]
  ] as const)(
    'keeps %s ownership when a legacy code is also used by Domain',
    (ErrorClass, create) => {
      expect(create()).toBeInstanceOf(ErrorClass)
    }
  )

  it('normalizes an undeclared code at the IPC boundary and rejects it during decoding', async () => {
    let invoke!: Parameters<IpcMainLike['handle']>[1]
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    registerIpcHandler({
      ipcMain: {
        handle: (_channel, handler) => {
          invoke = handler
        }
      },
      logger,
      channel: 'test',
      operation: 'test',
      scope: 'test',
      handler: () => {
        throw createExpectedAppError('UNREGISTERED_FAILURE', 'Undeclared failure.')
      }
    })
    await expect(invoke({}, undefined)).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNEXPECTED_ERROR', isExpected: false }
    })
    expect(
      isSerializedAppError(
        { code: 'UNREGISTERED_FAILURE', message: 'bad', isExpected: true },
        isRegisteredApplicationErrorCode
      )
    ).toBe(false)
    expect(logger.error).toHaveBeenCalledOnce()
  })
})
