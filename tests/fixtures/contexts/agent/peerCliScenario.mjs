import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'

// A deterministic MCP client hosted by each native-terminal CLI fixture.
export async function runPeerScenario(providerId, args) {
  const source = process.env.CLEANCODE_FAKE_PEER_SOURCE
  const reportPath = process.env.CLEANCODE_FAKE_PEER_REPORT
  try {
    let url
    if (providerId === 'codex') {
      const setting = args.find((arg) => arg.startsWith('mcp_servers.cleancode='))
      if (!setting) throw new Error('Missing Codex MCP launch configuration.')
      const match = /url=("(?:\\.|[^"\\])*"|'[^']*')/.exec(setting)
      if (!match) throw new Error('Missing Codex MCP URL.')
      url = match[1].startsWith("'") ? match[1].slice(1, -1) : JSON.parse(match[1])
    } else {
      const configPath = args[args.indexOf('--mcp-config') + 1]
      url = JSON.parse(await readFile(configPath, 'utf8')).mcpServers.cleancode.url
    }
    let sequence = 0
    const rpc = async (method, params, notification = false) => {
      const response = await globalThis.fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.CLEANCODE_MCP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          ...(notification ? {} : { id: ++sequence }),
          method,
          params
        })
      })
      if (notification) return
      const body = await response.json()
      if (body.error || body.result?.isError) throw new Error(JSON.stringify(body))
      return body.result
    }
    const call = async (name, arguments_) =>
      (await rpc('tools/call', { name, arguments: arguments_ })).structuredContent.output
    await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'peer-fixture', version: '1' }
    })
    await rpc('notifications/initialized', {}, true)
    if (providerId === source) {
      const target = source === 'codex' ? 'claude-code' : 'codex'
      const providers = await call('list_agent_providers', {})
      if (!providers.providers.some((provider) => provider.providerId === target))
        throw new Error('Target provider not creatable.')
      const created = await call('create_agent', {
        agentId: 'peer-reviewer',
        providerId: target,
        initialTask: 'Review fixture revision abc and report the result.'
      })
      const reply = await call('wait_agent_message', { replyToMessageId: created.initialMessageId })
      if (reply.result.status !== 'message') throw new Error('Peer did not reply.')
      await call('wait_agent_message', {
        acknowledgeMessageId: reply.result.message.messageId,
        timeoutMs: 0
      })
      await writeFile(
        reportPath,
        JSON.stringify({
          status: 'completed',
          source,
          replyToMessageId: reply.result.message.replyToMessageId
        })
      )
      process.stdout.write('PEER_REVIEW_COMPLETE\n')
    } else {
      if (!args.at(-1)?.includes('wait_agent_message'))
        throw new Error('Native initial prompt was not supplied.')
      const received = await call('wait_agent_message', {})
      if (received.result.status !== 'message') throw new Error('No initial task was delivered.')
      const task = received.result.message
      await call('send_agent_message', {
        messageId: 'review-result',
        toAgentId: task.fromAgentId,
        replyToMessageId: task.messageId,
        kind: 'result',
        text: 'Reviewed fixture revision abc.'
      })
      await call('wait_agent_message', { acknowledgeMessageId: task.messageId, timeoutMs: 0 })
    }
  } catch (error) {
    await writeFile(
      reportPath,
      JSON.stringify({ status: 'failed', source, message: String(error) })
    )
  }
}
