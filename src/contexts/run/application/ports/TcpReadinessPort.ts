export interface WaitForTcpReadinessCommand {
  readonly host: '127.0.0.1'
  readonly port: number
  readonly signal: AbortSignal
}

type WaitForTcpClosureCommand = WaitForTcpReadinessCommand

export interface TcpReadinessPort {
  waitUntilReady(command: WaitForTcpReadinessCommand): Promise<void>
  waitUntilClosed(command: WaitForTcpClosureCommand): Promise<void>
}
