interface TerminalRunLifecycleScope {
  readonly projectId: string
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly blockId: string
}

export interface TerminalRunLifecycleLease {
  hardDispose(): Promise<void>
  quarantine(): void
  release(): void
  resolve(): void
}

export interface TerminalRunLifecyclePort {
  acquireTerminalDeletion(scope: TerminalRunLifecycleScope): Promise<TerminalRunLifecycleLease>
}

const noopTerminalRunLifecycleLease: TerminalRunLifecycleLease = {
  hardDispose: async () => undefined,
  quarantine: () => undefined,
  release: () => undefined,
  resolve: () => undefined
}

export const noopTerminalRunLifecyclePort: TerminalRunLifecyclePort = {
  acquireTerminalDeletion: async () => noopTerminalRunLifecycleLease
}
