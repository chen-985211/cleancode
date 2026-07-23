import type { AgentProviderPreferencesRepository } from '../ports/AgentProviderPreferencesRepository'

export class GetAgentProviderPreferencesUseCase {
  constructor(private readonly repository: AgentProviderPreferencesRepository) {}

  execute() {
    return this.repository.load()
  }
}
