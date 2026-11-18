export interface RestoredProjectsSnapshot {
  readonly projectDirectories: readonly string[]
  readonly currentProjectDirectory: string | null
}
