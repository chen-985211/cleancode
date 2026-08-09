export interface NativeDependencyPreparationOptions {
  readonly nodeExecutable: string
  readonly packageManagerExecutable: string | undefined
  readonly platform: NodeJS.Platform | string
}

export interface NativeDependencyPreparationInvocation {
  readonly args: readonly string[]
  readonly command: string
}

export interface NodePtyNativeFallbackOptions {
  readonly architecture: string
  readonly projectDirectory: string
}

export interface NodePtyNativeProbeOptions {
  readonly electronExecutable: string
  readonly probePath: string
}

export function resolveNativeDependencyPreparationInvocation(
  options: NativeDependencyPreparationOptions
): NativeDependencyPreparationInvocation | null

export function resolveNodePtyNativeFallbackDirectories(
  options: NodePtyNativeFallbackOptions
): readonly string[]

export function resolveNodePtyNativeProbeInvocation(
  options: NodePtyNativeProbeOptions
): NativeDependencyPreparationInvocation

export function prepareNativeDependencies(
  options?: Partial<NativeDependencyPreparationOptions>
): Promise<void>
