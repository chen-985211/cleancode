import { OpenTerminalLinkUseCase } from '../../../../src/contexts/run/application/use-cases/OpenTerminalLinkUseCase'

describe('open terminal link use case', () => {
  const command = {
    projectId: 'project-1',
    workspaceName: 'main',
    blockId: 'block-1',
    sessionId: 'session-1',
    runId: 'run-1',
    generation: 1,
    viewId: 'view-1'
  }
  const context = {
    getTerminalLinkContext: vi.fn(async () => ({
      workingDirectory: '/work/app/src',
      workspaceDirectory: '/work/app'
    }))
  }

  it('allows only HTTP(S) external links', async () => {
    const opener = { openExternal: vi.fn(async () => undefined), openLocal: vi.fn() }
    const useCase = new OpenTerminalLinkUseCase(context, { resolve: vi.fn() }, opener)

    await expect(
      useCase.execute({ ...command, rawTarget: 'https://example.com/docs?q=terminal' })
    ).resolves.toEqual({ kind: 'external', target: 'https://example.com/docs?q=terminal' })
    await expect(
      useCase.execute({ ...command, rawTarget: 'javascript:alert(1)' })
    ).rejects.toMatchObject({ code: 'TERMINAL_LINK_NOT_ALLOWED', isExpected: true })

    expect(opener.openExternal).toHaveBeenCalledTimes(1)
    expect(opener.openLocal).not.toHaveBeenCalled()
  })

  it('opens a canonical local target only when it remains inside the current workspace', async () => {
    const resolve = vi.fn(async () => ({
      canonicalPath: '/work/app/src/example.ts',
      kind: 'file' as const,
      relativeSegments: ['src', 'example.ts']
    }))
    const opener = { openExternal: vi.fn(), openLocal: vi.fn(async () => undefined) }
    const useCase = new OpenTerminalLinkUseCase(context, { resolve }, opener)

    await expect(useCase.execute({ ...command, rawTarget: './example.ts:12:4' })).resolves.toEqual({
      kind: 'local',
      target: '/work/app/src/example.ts',
      line: 12,
      column: 4
    })

    expect(resolve).toHaveBeenCalledWith({
      rawPath: './example.ts',
      workingDirectory: '/work/app/src',
      workspaceDirectory: '/work/app'
    })
    expect(opener.openLocal).toHaveBeenCalledWith({
      path: '/work/app/src/example.ts',
      line: 12,
      column: 4
    })
  })

  it('rejects canonical targets that escape through a parent segment or symlink', async () => {
    const opener = { openExternal: vi.fn(), openLocal: vi.fn() }
    const useCase = new OpenTerminalLinkUseCase(
      context,
      {
        resolve: vi.fn(async () => ({
          canonicalPath: '/private/secret.txt',
          kind: 'file' as const,
          relativeSegments: ['..', '..', 'private', 'secret.txt']
        }))
      },
      opener
    )

    await expect(
      useCase.execute({ ...command, rawTarget: '../outside/secret.txt:3' })
    ).rejects.toMatchObject({ code: 'TERMINAL_LINK_NOT_ALLOWED', isExpected: true })
    expect(opener.openLocal).not.toHaveBeenCalled()
  })
})
