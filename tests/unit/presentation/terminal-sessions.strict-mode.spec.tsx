import { act, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'

import { useTerminalSessions } from '../../../src/presentation/app-shell/coordinators/useTerminalSessions'
import type { TerminalSurface } from '../../../src/contexts/run/presentation/terminal-surface/terminalSurfaceRegistry'

it('retains terminal mounts after StrictMode effect replay and disposes them on real unmount', async () => {
  const hook = renderHook(
    () =>
      useTerminalSessions({
        currentProject: undefined,
        currentWorkspace: undefined,
        currentTerminalBlockIds: undefined,
        focusTerminalBlock: vi.fn(),
        notify: vi.fn(),
        runtimeAvailability: { phase: 'initializing', epoch: 0, errorCode: null, retryable: false }
      }),
    { wrapper: StrictMode }
  )
  await act(async () => {})
  const surface: TerminalSurface = {
    attach: vi.fn(),
    detach: vi.fn(),
    dispose: vi.fn(),
    park: vi.fn(),
    retain: vi.fn(() => true),
    clearSearch: vi.fn(),
    find: vi.fn(),
    focus: vi.fn(),
    getDiagnostics: () => ({ pendingOutputBytes: 0, rendererState: 'dom' }),
    isBracketedPasteMode: () => false,
    isOutputSettled: () => true,
    onOutputSettled: () => () => undefined,
    restore: async () => 'ready',
    setScrollbackRows: vi.fn(),
    setResizeSuspended: vi.fn(),
    write: vi.fn()
  }
  const registry = hook.result.current.terminalSurfaceRegistry
  const identity = {
    projectId: 'project',
    workspaceId: 'workspace',
    blockId: 'terminal',
    sessionId: 'session',
    runId: 'run',
    generation: 1
  }
  const lease = registry.create(identity, () => surface)
  const detach = vi.fn(async () => undefined)
  expect(registry.retain(lease.viewId, { detach, onInput: vi.fn() })).toBe(true)
  expect(registry.create(identity, () => surface)).toMatchObject({
    viewId: lease.viewId,
    retained: true
  })
  expect(registry.retain(lease.viewId, { detach, onInput: vi.fn() })).toBe(true)
  hook.unmount()
  await act(async () => {})
  expect(detach).toHaveBeenCalledOnce()
  expect(surface.dispose).toHaveBeenCalledOnce()
})
