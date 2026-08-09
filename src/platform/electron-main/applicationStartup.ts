export async function startApplicationAfterElectronReady(input: {
  readonly createWindow: () => void
  readonly initializeRunRuntime: () => Promise<unknown>
  readonly onRunRuntimeInitializationFailure: (error: unknown) => void
}): Promise<void> {
  input.createWindow()
  try {
    await input.initializeRunRuntime()
  } catch (error) {
    input.onRunRuntimeInitializationFailure(error)
  }
}
