export const piSessionExtensionSource = String.raw`
import { statSync } from 'node:fs';
export default function (pi) {
  let current;
  let pending;
  let running = false;
  let successful = false;
  function capture(ctx) {
    const file = ctx.sessionManager.getSessionFile();
    let durable = false;
    try { durable = Boolean(file && statSync(file).isFile() && statSync(file).size > 0); } catch {}
    reportSession(durable ? file : null);
  }
  function changed(_event, ctx) {
    if (pending) clearImmediate(pending);
    current = ctx;
    running = false;
    successful = false;
    capture(ctx);
    // A session switch is not a completed turn of the previous session.
    return reportActivity('unavailable');
  }
  pi.on('session_start', changed);
  pi.on('session_switch', changed);
  pi.on('session_fork', changed);
  pi.on('agent_start', (_event, ctx) => {
    current = ctx;
    running = true;
    successful = false;
    return reportActivity('working');
  });
  pi.on('ui_prompt_start', () => reportActivity('waiting_input'));
  pi.on('ui_prompt_end', () => reportActivity(running ? 'working' : 'unavailable'));
  pi.on('message_end', (_event, ctx) => {
    current = ctx;
    if (pending) clearImmediate(pending);
    // Pi emits message_end before SessionManager persists that message.
    pending = setImmediate(() => { pending = undefined; if (current === ctx) capture(ctx); });
  });
  pi.on('agent_end', (event, ctx) => {
    capture(ctx);
    const last = event.messages?.filter(message => message.role === 'assistant').at(-1);
    successful = last?.stopReason === 'stop';
  });
  pi.on('agent_settled', (_event, ctx) => {
    if (!running || (ctx.isIdle && !ctx.isIdle())) return;
    running = false;
    return reportActivity(successful ? 'completed' : 'unavailable');
  });
  pi.on('session_shutdown', (_event, ctx) => {
    if (pending) clearImmediate(pending);
    current = undefined;
    running = false;
    successful = false;
    capture(ctx);
    return reportActivity('unavailable');
  });
}
`
