export interface AgentProviderInstallCommands {
  readonly linux: string
  readonly macos: string
  readonly windows: string
}

export function resolveAgentProviderInstallCommand(
  commands: AgentProviderInstallCommands,
  runtimePlatform: NodeJS.Platform = process.platform
): string {
  if (runtimePlatform === 'win32') return commands.windows
  if (runtimePlatform === 'darwin') return commands.macos
  return commands.linux
}
