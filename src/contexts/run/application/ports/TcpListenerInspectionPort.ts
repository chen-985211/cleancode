export type TcpListenerInspection =
  | { readonly ownership: 'owned'; readonly listenerProcessId: number }
  | { readonly ownership: 'external'; readonly listenerProcessId: number }
  | { readonly ownership: 'unknown'; readonly reason: string }

export interface TcpListenerInspectionPort {
  inspect(command: {
    readonly host: '127.0.0.1'
    readonly port: number
    readonly rootProcessId: number
  }): Promise<TcpListenerInspection>
}
