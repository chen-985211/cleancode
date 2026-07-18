export interface ServiceEndpointOpenerPort {
  open(address: string): Promise<void>
}
