import type { ServiceProtocol } from './ServicePortIntent'

export interface ActualServiceEndpoint {
  readonly protocol: ServiceProtocol
  readonly host: '127.0.0.1'
  readonly port: number
  readonly requestedPort: number | null
  readonly fallback: boolean
  readonly displayAddress: string
  readonly openable: boolean
}

export function createActualServiceEndpoint(input: {
  readonly protocol: ServiceProtocol
  readonly port: number
  readonly requestedPort: number | null
}): ActualServiceEndpoint {
  const host = '127.0.0.1' as const
  return Object.freeze({
    protocol: input.protocol,
    host,
    port: input.port,
    requestedPort: input.requestedPort,
    fallback: input.requestedPort !== null && input.requestedPort !== input.port,
    displayAddress: `${input.protocol}://${host}:${input.port}`,
    openable: input.protocol === 'http' || input.protocol === 'https'
  })
}
