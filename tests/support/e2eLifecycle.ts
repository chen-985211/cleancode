export interface E2eTeardownSteps {
  readonly captureFailureDiagnostics?: () => Promise<void>
  readonly cleanupScenario?: () => Promise<void>
  readonly closeApplication?: () => Promise<void>
}

export const e2eTeardownTimeoutMs = 50_000

export async function runE2eTeardown(steps: E2eTeardownSteps): Promise<void> {
  try {
    await steps.captureFailureDiagnostics?.()
  } finally {
    try {
      await steps.closeApplication?.()
    } finally {
      await steps.cleanupScenario?.()
    }
  }
}

export async function withE2eDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`${operation} timed out after ${timeoutMs}ms.`)),
          timeoutMs
        )
      })
    ])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}
