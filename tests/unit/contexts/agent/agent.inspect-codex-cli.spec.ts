import { InspectCodexCliUseCase } from '../../../../src/contexts/agent/application/use-cases/InspectCodexCliUseCase'
import type {
  CodexCliInstallationSnapshot,
  CodexCliPort
} from '../../../../src/contexts/agent/application/ports/CodexCliPort'

describe('inspect Codex CLI', () => {
  it('returns the installed Codex CLI version', async () => {
    const inspectCodexCli = new InspectCodexCliUseCase(
      createCodexCliPort({
        installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
        status: 'installed',
        version: 'codex-cli 0.143.0'
      })
    )

    await expect(inspectCodexCli.execute()).resolves.toEqual({
      installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
      status: 'installed',
      version: 'codex-cli 0.143.0'
    })
  })

  it('returns a quick install command when Codex CLI is missing', async () => {
    const inspectCodexCli = new InspectCodexCliUseCase(
      createCodexCliPort({
        installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
        status: 'missing',
        version: null
      })
    )

    await expect(inspectCodexCli.execute()).resolves.toEqual({
      installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
      status: 'missing',
      version: null
    })
  })
})

function createCodexCliPort(result: CodexCliInstallationSnapshot): CodexCliPort {
  return {
    inspect: async () => result
  }
}
