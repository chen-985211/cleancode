export interface PollUntilStateOptions<Observation> {
  readonly accept: (observation: Observation) => boolean
  readonly describeObservation?: (observation: Observation) => string
  readonly description: string
  readonly intervalMs?: number
  readonly observe: () => Observation | Promise<Observation>
  readonly retryObservationErrors?: boolean
  readonly timeoutMs: number
}

export async function pollUntilState<Observation>(
  options: PollUntilStateOptions<Observation>
): Promise<Observation> {
  const intervalMs = Math.max(1, options.intervalMs ?? 50)
  const deadline = Date.now() + options.timeoutMs
  let hasObservation = false
  let lastObservation: Observation | undefined
  let lastObservationError: unknown

  while (true) {
    try {
      lastObservation = await options.observe()
      hasObservation = true
      lastObservationError = undefined

      if (options.accept(lastObservation)) {
        return lastObservation
      }
    } catch (error) {
      if (!options.retryObservationErrors) throw error
      lastObservationError = error
    }

    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) break
    await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remainingMs)))
  }

  const lastState = lastObservationError
    ? `Last observation error: ${describeValue(lastObservationError)}`
    : `Last observation: ${
        hasObservation
          ? (options.describeObservation?.(lastObservation as Observation) ??
            describeValue(lastObservation))
          : 'unavailable'
      }`
  throw new Error(
    `Timed out waiting for ${options.description} after ${options.timeoutMs}ms. ${lastState}`,
    lastObservationError ? { cause: lastObservationError } : undefined
  )
}

function describeValue(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`

  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}
