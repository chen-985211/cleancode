import type { CodexCliInstallationSnapshot, CodexCliPort } from '../ports/CodexCliPort'

export class InspectCodexCliUseCase {
  constructor(private readonly codexCli: CodexCliPort) {}

  execute(): Promise<CodexCliInstallationSnapshot> {
    return this.codexCli.inspect()
  }
}
