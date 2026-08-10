export interface WindowsNodePtyNativeArtifactOptions {
  readonly architecture?: string
  readonly artifactDirectory: string
  readonly platform?: string
  readonly projectDirectory?: string
}

export function exportWindowsNodePtyNativeArtifact(
  options: WindowsNodePtyNativeArtifactOptions
): Promise<void>

export function restoreWindowsNodePtyNativeArtifact(
  options: WindowsNodePtyNativeArtifactOptions
): Promise<void>
