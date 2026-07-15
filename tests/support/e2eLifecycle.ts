export interface E2eTeardownSteps {
  readonly captureFailureDiagnostics?: () => Promise<void>
  readonly cleanupScenario?: () => Promise<void>
  readonly closeApplication?: () => Promise<void>
}

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
