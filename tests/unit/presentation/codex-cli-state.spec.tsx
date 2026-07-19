import { act, renderHook, waitFor } from '@testing-library/react'

import type { CodexCliInstallationSnapshot } from '../../../src/contexts/agent/application/ports/CodexCliPort'
import { useCodexCliState } from '../../../src/presentation/app-shell/useCodexCliState'
import { createRuntimeApi } from '../../fixtures/presentation/appShellFixtures'

describe('Codex CLI presentation state', () => {
  it('does not let an older inspection overwrite a newer manual retry', async () => {
    const firstInspection = createDeferred<CodexCliInstallationSnapshot>()
    const retryInspection = createDeferred<CodexCliInstallationSnapshot>()
    const inspectCodexCli = vi
      .fn()
      .mockImplementationOnce(() => firstInspection.promise)
      .mockImplementationOnce(() => retryInspection.promise)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ inspectCodexCli })
    })

    const { result } = renderHook(() => useCodexCliState())
    await waitFor(() => expect(inspectCodexCli).toHaveBeenCalledTimes(1))

    act(() => result.current.retry())
    await waitFor(() => expect(inspectCodexCli).toHaveBeenCalledTimes(2))

    await act(async () => {
      retryInspection.resolve({ status: 'installed', version: 'codex-cli 0.144.6' })
    })
    expect(result.current.state).toEqual({
      installation: { status: 'installed', version: 'codex-cli 0.144.6' },
      status: 'ready'
    })

    await act(async () => {
      firstInspection.resolve({
        installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
        reason: 'not_found',
        status: 'missing',
        version: null
      })
    })
    expect(result.current.state).toEqual({
      installation: { status: 'installed', version: 'codex-cli 0.144.6' },
      status: 'ready'
    })
  })
})

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}
