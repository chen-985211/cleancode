import type { ElectronApplication } from 'playwright'
import { pollUntilState } from './e2ePolling'

export async function setElectronContentSize(
  app: ElectronApplication,
  size: { readonly width: number; readonly height: number }
): Promise<void> {
  try {
    await app.evaluate(({ BrowserWindow }, { width, height }) => {
      BrowserWindow.getAllWindows()[0]!.setContentSize(width, height)
    }, size)
  } catch (error) {
    // Windows can lose the evaluation response while resizing. Do not repeat
    // the mutation: require its native postcondition before proceeding.
    if (!(error instanceof Error) || !error.message.includes('Execution context was destroyed')) {
      throw error
    }
  }
  await pollUntilState({
    description: `Electron content size ${size.width}x${size.height}`,
    observe: () =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getContentSize()),
    accept: ([width, height]) => width === size.width && height === size.height,
    retryObservationErrors: true,
    timeoutMs: 5000
  })
}
