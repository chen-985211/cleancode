/** Both launch adapters deliver the same normalized facts, with bounded serial delivery. */
export const providerActivityReportSource = String.raw`
import { readFileSync as readActivityFile } from 'node:fs';
const activityEnvironment = { ...process.env };
// Pi can reload modules without replacing the CLI process or launch identity.
const activityTransports = globalThis[Symbol.for('cleancode.providerActivityTransports')] ??= new Map();
const activityKey = activityEnvironment.CLEANCODE_PROVIDER_ACTIVITY_URL || [activityEnvironment.CLEANCODE_AGENT_ACTIVITY_MANIFEST, activityEnvironment.CLEANCODE_AGENT_ACTIVITY_INVOCATION_ID].join(':');
const activityTransport = activityTransports.get(activityKey) ?? { revision: 0, queue: [], sending: undefined, status: undefined };
activityTransports.set(activityKey, activityTransport);
while (activityTransports.size > 16) activityTransports.delete(activityTransports.keys().next().value);
function reportActivity(value) {
  if (value !== 'completed' && value === activityTransport.status) return activityTransport.sending;
  activityTransport.status = value === 'completed' ? 'idle' : value;
  const signal = value === 'completed' ? { type: 'turn_completed' } : { type: 'status_changed', status: value };
  if (activityTransport.queue.length >= 64) {
    // Once ordering is lost, report unavailable rather than a speculative completion.
    activityTransport.queue = [{ signal: { type: 'status_changed', status: 'unavailable' }, revision: ++activityTransport.revision }];
    activityTransport.status = 'unavailable';
  } else activityTransport.queue.push({ signal, revision: ++activityTransport.revision });
  return flushProviderActivity();
}
function flushProviderActivity() {
  if (activityTransport.sending) return activityTransport.sending;
  activityTransport.sending = (async () => {
    while (activityTransport.queue.length) {
      const report = activityTransport.queue.shift();
      try {
        const managed = activityEnvironment.CLEANCODE_PROVIDER_ACTIVITY_URL;
        if (activityEnvironment.CLEANCODE_PROVIDER_ACTIVITY_PROVIDER && !managed) continue;
        let url = managed;
        let token = activityEnvironment.CLEANCODE_PROVIDER_ACTIVITY_TOKEN;
        let body = report;
        if (!managed) {
          const manifest = activityEnvironment.CLEANCODE_AGENT_ACTIVITY_MANIFEST;
          if (!manifest || !activityEnvironment.CLEANCODE_AGENT_ACTIVITY_INVOCATION_ID) continue;
          url = JSON.parse(readActivityFile(manifest, 'utf8')).url;
          token = activityEnvironment.CLEANCODE_AGENT_ACTIVITY_TOKEN;
          const terminal = JSON.parse(Buffer.from(activityEnvironment.CLEANCODE_AGENT_ACTIVITY_SCOPE || '', 'base64url').toString('utf8'));
          body = { identity: { terminal, providerId: activityEnvironment.CLEANCODE_AGENT_ACTIVITY_PROVIDER_ID, invocationId: activityEnvironment.CLEANCODE_AGENT_ACTIVITY_INVOCATION_ID }, signal: report.signal };
        }
        if (!url || !token) continue;
        const response = await fetch(url, {
          method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
          body: JSON.stringify(body), signal: AbortSignal.timeout(750)
        });
        await response.body?.cancel();
        if (!response.ok) activityTransport.queue = [];
      } catch { activityTransport.queue = []; }
    }
  })().finally(() => { activityTransport.sending = undefined; if (activityTransport.queue.length) flushProviderActivity(); });
  return activityTransport.sending;
}
`
