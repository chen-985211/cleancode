import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { collectLoggingViolations } from '../../../scripts/check-logging.mjs'

describe('logging quality gate', () => {
  it('reads common literal codes from their owner instead of a gate-local vocabulary', async () => {
    await withGateSource(
      'src/contexts/project/application/common.ts',
      "import { createExpectedAppError } from '../../../shared-kernel/application/errors/AppError'; throw createExpectedAppError('NEW_COMMON_FAILURE', 'Common failure')",
      async (directory) => {
        expect(await collectLoggingViolations({ cwd: directory })).toEqual([])
      },
      ['NEW_COMMON_FAILURE']
    )
  })

  it.each([
    [
      'domain',
      "import { AppError as Failure } from '../../../shared-kernel/domain/errors/AppError'; throw new Failure({ code: 'PROJECT_ISSUE_INVALID', message: 'Invalid', isExpected: true })"
    ],
    [
      'domain',
      "import * as errors from '../../../shared-kernel/domain/errors/AppError'; throw new errors.AppError({ code: 'PROJECT_ISSUE_INVALID', message: 'Invalid', isExpected: true })"
    ],
    [
      'domain',
      "import * as errors from '../../../shared-kernel/domain/errors/AppError'; throw new errors['AppError']({ code: 'PROJECT_ISSUE_INVALID', message: 'Invalid', isExpected: true })"
    ],
    [
      'domain',
      "import { AppError } from '../../../shared-kernel/domain/errors/AppError'; const Failure = AppError; throw new Failure({ code: 'PROJECT_ISSUE_INVALID', message: 'Invalid', isExpected: true })"
    ],
    [
      'domain',
      "import { AppError } from '../../../shared-kernel/domain/errors/AppError'; throw new AppError<string>({ code: 'PROJECT_ISSUE_INVALID', message: 'Invalid', isExpected: true })"
    ],
    [
      'domain',
      "import { createExpectedAppError as fail } from '../../../shared-kernel/application/errors/AppError'; throw fail('PROJECT_ISSUE_INVALID', 'Invalid')"
    ],
    [
      'application',
      "import { createExpectedAppError } from '../../../shared-kernel/application/errors/AppError'; throw createExpectedAppError('PROJECT_ISSUE_INVALID', 'Invalid')"
    ],
    [
      'infrastructure',
      "import * as errors from '../../../shared-kernel/application/errors/AppError'; throw errors.createExpectedAppError('PROJECT_ISSUE_INVALID', 'Invalid')"
    ],
    [
      'application',
      "import { AppError } from '../../../shared-kernel/domain/errors/AppError'; throw new AppError({ ...error, code: 'PROJECT_ISSUE_INVALID' })"
    ],
    [
      'infrastructure',
      "import { AppError as Failure } from '../../../shared-kernel/application/errors/AppError'; throw new Failure({ code: 'PROJECT_ISSUE_INVALID', message: 'Invalid', isExpected: true })"
    ]
  ])('rejects unowned business errors in %s: %s', async (layer, source) => {
    await withGateSource(`src/contexts/project/${layer}/failure.ts`, source, async (directory) => {
      expect(await collectLoggingViolations({ cwd: directory })).toEqual([
        expect.objectContaining({
          rule: layer === 'domain' ? 'no-unowned-domain-error' : 'no-unowned-context-error'
        })
      ])
    })
  })

  it.each([
    [
      'domain',
      "// Do not call createExpectedAppError(...) or throw new Error(...).\nexport const documentation = 'new AppError(...)'"
    ],
    ['domain', 'class AppError extends Error {}\nthrow new AppError()'],
    [
      'application',
      "import { createExpectedAppError as fail } from '../../../shared-kernel/application/errors/AppError'; function local(fail: () => Error) { return fail() }"
    ],
    [
      'domain',
      "import { createExpectedAppError as common } from '../../../shared-kernel/domain/errors/AppError'; throw common('INVALID_CANVAS_OBJECT_IDENTITY', 'Invalid identity')"
    ],
    [
      'application',
      "import { createExpectedAppError } from '../../../shared-kernel/domain/errors/AppError'; export const failure = (code: CommonErrorCode) => createExpectedAppError(code, 'Common failure')"
    ],
    [
      'application',
      "import { createExpectedAppError } from '../../../shared-kernel/application/errors/AppError'; throw createExpectedAppError('UNEXPECTED_ERROR', 'Service exited')"
    ],
    [
      'application',
      "import { AppError as Failure } from '../../../shared-kernel/application/errors/AppError'; throw new Failure({ ...error, message: error.message, details: { repository: 'repo' } })"
    ],
    [
      'infrastructure',
      "import { createClientAppError } from '../../../shared-kernel/application/errors/AppError'; throw createClientAppError(envelope)"
    ],
    [
      'domain',
      "import { AppError } from '../../../shared-kernel/domain/errors/AppError'; export class ProjectDomainError extends AppError {}"
    ],
    [
      'application',
      "import { createProjectError } from './errors/ProjectErrors'; throw createProjectError('PROJECT_ISSUE_INVALID', 'Invalid')"
    ],
    [
      'presentation',
      "import { createExpectedAppError } from '../../../shared-kernel/application/errors/AppError'; throw createExpectedAppError(observedCode, 'Observed failure')"
    ]
  ])(
    'preserves legitimate %s errors and ignores non-executable examples: %s',
    async (layer, source) => {
      await withGateSource(`src/contexts/project/${layer}/valid.ts`, source, async (directory) => {
        expect(await collectLoggingViolations({ cwd: directory })).toEqual([])
      })
    }
  )

  it('rejects domain business errors constructed without their context owner', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-error-owner-'))
    try {
      await mkdir(join(directory, 'src', 'contexts', 'project', 'domain'), { recursive: true })
      await writeFile(
        join(directory, 'src', 'contexts', 'project', 'domain', 'bad.ts'),
        "throw createExpectedAppError('PROJECT_NOT_FOUND', 'Missing project.')\n"
      )
      expect(await collectLoggingViolations({ cwd: directory })).toEqual([
        expect.objectContaining({ rule: 'no-unowned-domain-error' })
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('flags direct console usage outside the logging sink', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-logging-'))

    try {
      await mkdir(join(directory, 'src', 'presentation'), { recursive: true })
      await writeFile(
        join(directory, 'src', 'presentation', 'bad.ts'),
        "console.error('not through logger')\n"
      )

      expect(await collectLoggingViolations({ cwd: directory })).toEqual([
        expect.objectContaining({
          filePath: 'src/presentation/bad.ts',
          rule: 'no-direct-console'
        })
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('flags bare Electron IPC handlers', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-logging-'))

    try {
      await mkdir(join(directory, 'src', 'platform', 'electron-main'), { recursive: true })
      await writeFile(
        join(directory, 'src', 'platform', 'electron-main', 'bad.ts'),
        "ipcMain.handle('cleancode:test', async () => null)\n"
      )

      expect(await collectLoggingViolations({ cwd: directory })).toEqual([
        expect.objectContaining({
          filePath: 'src/platform/electron-main/bad.ts',
          rule: 'no-bare-ipc-main-handle'
        })
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('flags renderer message parsing for application errors', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-logging-'))

    try {
      await mkdir(join(directory, 'src', 'presentation'), { recursive: true })
      await writeFile(
        join(directory, 'src', 'presentation', 'bad.ts'),
        "if (error.message.includes('Git branch already exists')) return 'duplicate'\n"
      )

      expect(await collectLoggingViolations({ cwd: directory })).toEqual([
        expect.objectContaining({
          filePath: 'src/presentation/bad.ts',
          rule: 'no-renderer-error-message-parsing'
        })
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('flags bare application and domain errors inside bounded contexts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-logging-'))

    try {
      await mkdir(join(directory, 'src', 'contexts', 'project', 'application'), {
        recursive: true
      })
      await writeFile(
        join(directory, 'src', 'contexts', 'project', 'application', 'bad.ts'),
        "throw new Error('Project was not found.')\n"
      )

      expect(await collectLoggingViolations({ cwd: directory })).toEqual([
        expect.objectContaining({
          filePath: 'src/contexts/project/application/bad.ts',
          rule: 'no-bare-context-application-error'
        })
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('allows console output inside scripts and the platform logging sink', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-logging-'))

    try {
      await mkdir(join(directory, 'scripts'), { recursive: true })
      await mkdir(join(directory, 'src', 'platform', 'logging'), { recursive: true })
      await writeFile(join(directory, 'scripts', 'task.mjs'), "console.log('ok')\n")
      await writeFile(
        join(directory, 'src', 'platform', 'logging', 'ConsoleLogSink.ts'),
        "console.error('ok')\n"
      )

      expect(await collectLoggingViolations({ cwd: directory })).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

async function withGateSource(
  filePath: string,
  source: string,
  verify: (directory: string) => Promise<void>,
  commonCodes = ['INVALID_CANVAS_OBJECT_IDENTITY', 'UNEXPECTED_ERROR']
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'cleancode-error-gate-'))
  try {
    const target = join(directory, filePath)
    const commonModule = join(directory, 'src/shared-kernel/domain/errors/AppError.ts')
    await mkdir(dirname(target), { recursive: true })
    await mkdir(dirname(commonModule), { recursive: true })
    await writeFile(
      commonModule,
      `export const commonErrorCodes = ${JSON.stringify(commonCodes)} as const`
    )
    await writeFile(target, source)
    await verify(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
