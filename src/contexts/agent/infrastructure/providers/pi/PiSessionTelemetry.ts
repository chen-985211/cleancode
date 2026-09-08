import type {
  AgentProviderSessionRefCodec,
  AgentTelemetryContribution
} from '../../../application/ports/AgentProviderContribution'
import { createTemporaryProviderConfig } from '../shared/TemporaryProviderConfig'
import {
  createProviderSessionFileReporter,
  createSessionReportWriterSource
} from '../terminal-cli/ProviderSessionFileReporter'

export class PiSessionTelemetry implements AgentTelemetryContribution {
  readonly signals = { activity: false, sessionIdentity: true } as const

  constructor(private readonly codec: AgentProviderSessionRefCodec) {}

  async prepare(command: Parameters<AgentTelemetryContribution['prepare']>[0]) {
    const reportPath = await createProviderSessionFileReporter(command, this.codec, 'pi-session')
    const extension = await createTemporaryProviderConfig(
      'cleancode-pi-session-',
      'session.mjs',
      createSessionReportWriterSource(reportPath) + piSessionExtensionSource
    )
    command.artifacts.track('pi-session-extension', extension)
    return { args: ['--extension', extension.path], env: {} }
  }
}

const piSessionExtensionSource = `
import { statSync } from 'node:fs';
export default function (pi) {
  let current;
  let pending;
  function capture(ctx) {
    const file = ctx.sessionManager.getSessionFile();
    let durable = false;
    try { durable = Boolean(file && statSync(file).isFile() && statSync(file).size > 0); } catch {}
    reportSession(durable ? file : null);
  }
  function changed(_event, ctx) {
    if (pending) clearImmediate(pending);
    current = ctx;
    capture(ctx);
  }
  pi.on('session_start', changed);
  // Older Pi releases emit separate switch/fork events instead of rebinding extensions.
  pi.on('session_switch', changed);
  pi.on('session_fork', changed);
  pi.on('message_end', (_event, ctx) => {
    current = ctx;
    if (pending) clearImmediate(pending);
    // Pi emits message_end before SessionManager persists that message.
    pending = setImmediate(() => { pending = undefined; if (current === ctx) capture(ctx); });
  });
  pi.on('agent_end', (_event, ctx) => capture(ctx));
  pi.on('session_shutdown', (_event, ctx) => {
    if (pending) clearImmediate(pending);
    current = undefined;
    capture(ctx);
  });
}
`
