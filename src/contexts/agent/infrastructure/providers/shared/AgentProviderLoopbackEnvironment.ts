const requiredLoopbackHosts = ['127.0.0.1', 'localhost', '::1'] as const

export function createAgentProviderLoopbackEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env
): Readonly<Record<'NO_PROXY' | 'no_proxy', string>> {
  const hosts: string[] = []
  const normalizedHosts = new Set<string>()
  for (const value of [environment.NO_PROXY, environment.no_proxy]) {
    for (const host of splitHosts(value)) addHost(hosts, normalizedHosts, host)
  }
  for (const host of requiredLoopbackHosts) addHost(hosts, normalizedHosts, host)
  const value = hosts.join(',')
  return { NO_PROXY: value, no_proxy: value }
}

function splitHosts(value: string | undefined): readonly string[] {
  return (
    value
      ?.split(',')
      .map((host) => host.trim())
      .filter(Boolean) ?? []
  )
}

function addHost(hosts: string[], normalizedHosts: Set<string>, host: string): void {
  const normalizedHost = host.toLowerCase()
  if (normalizedHosts.has(normalizedHost)) return
  normalizedHosts.add(normalizedHost)
  hosts.push(host)
}
