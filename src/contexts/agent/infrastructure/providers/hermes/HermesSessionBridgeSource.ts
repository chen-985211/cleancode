/** Observe only this TUI's local gateway protocol and its explicit foreground selection. */
export const hermesSessionBridgeSource = String.raw`
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { realpathSync, statSync, watchFile, unwatchFile } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { StringDecoder } from 'node:string_decoder';

const activeFile = process.env.HERMES_TUI_ACTIVE_SESSION_FILE;
if (activeFile) {
  const sessions = new Map();
  const pending = new Map();
  const originalSpawn = childProcess.spawn;
  let gateway;
  let immediate;
  let selection;
  let selectionStamp;
  let selectionVersion = 0;
  let branchSequence = 0;
  let branchAcceptance;
  let branchAcceptanceExpiry;
  let activitySelection;
  let activitySelectionVersion;
  function reportActivityWaiting(session = sessions.get(activitySelection)) {
    reportActivity(session?.approvals.size > 0 ? 'waiting_approval' : session?.prompts.size > 0 ? 'waiting_input' : session?.running ? 'working' : 'unavailable');
  }
  function syncActivitySelection() {
    const selected = readSelection();
    if (selected !== activitySelection || selectionVersion !== activitySelectionVersion) {
      activitySelection = selected;
      activitySelectionVersion = selectionVersion;
      reportActivity('unavailable');
      reportActivityWaiting();
    }
    return selected;
  }
  function isForeground(id) {
    const selected = syncActivitySelection();
    return typeof id === 'string' && (id === selected || (sessions.has(id) && sessions.get(id) === sessions.get(selected)));
  }
  function activityEvent(params) {
    if (!params || !['message.start', 'message.complete', 'error', 'secret.expire', 'sudo.expire', 'approval.request', 'clarify.request', 'secret.request', 'sudo.request'].includes(params.type)) return;
    const foreground = isForeground(params.session_id);
    if (!sessions.has(params.session_id)) remember(params.session_id, null, false);
    const session = sessions.get(params.session_id);
    if (!session) return;
    // Retain only bounded protocol metadata, including unresolved background waits.
    if (params.type === 'message.start') {
      session.running = true;
    } else if (params.type === 'message.complete' || params.type === 'error') {
      const running = session.running;
      const waiting = session.approvals.size > 0 || session.prompts.size > 0;
      session.running = false;
      session.approvals.clear();
      session.prompts.clear();
      if (foreground && (running || waiting || params.type === 'error')) {
        reportActivity(running && params.type === 'message.complete' && params.payload?.status === 'complete' ? 'completed' : 'unavailable');
      }
      return;
    } else if (['secret.expire', 'sudo.expire'].includes(params.type)) {
      session.prompts.delete(params.payload?.request_id);
    } else if (params.type === 'approval.request') {
      session.approvals.add({});
      if (session.approvals.size > 64) session.approvals.delete(session.approvals.values().next().value);
    } else {
      const id = params.payload?.request_id;
      if (typeof id === 'string' && !session.prompts.has(id)) {
        session.prompts.set(id, {});
        if (session.prompts.size > 64) session.prompts.delete(session.prompts.keys().next().value);
      }
    }
    if (foreground) reportActivityWaiting(session);
  }
  function clearBranchAcceptance() {
    if (branchAcceptanceExpiry) clearImmediate(branchAcceptanceExpiry);
    branchAcceptance = undefined;
    branchAcceptanceExpiry = undefined;
  }
  function readSelection() {
    try {
      const text = readFileSync(activeFile, 'utf8');
      if (text.length <= 2048) {
        const selected = JSON.parse(text).session_id;
        const stat = statSync(activeFile, { bigint: true });
        const stamp = [stat.ino, stat.mtimeNs, stat.ctimeNs, text].join(':');
        if (typeof selected === 'string' && selected && stamp !== selectionStamp) {
          selectionStamp = stamp;
          selectionVersion++;
          selection = selected;
        }
      }
    } catch { /* The selection file can be empty or mid-write. */ }
    return selection;
  }
  function sample() {
    const session = sessions.get(syncActivitySelection());
    if (session) reportSession(session.durable ? session.key : null);
  }
  function scheduleSample() {
    if (immediate) clearImmediate(immediate);
    immediate = setImmediate(() => { immediate = undefined; sample(); });
  }
  function remember(id, key, durable) {
    if (typeof id !== 'string' || !id || (key !== null && (typeof key !== 'string' || !/^[0-9]{8}_[0-9]{6}_[a-f0-9]{6,8}$/.test(key)))) return;
    const session = sessions.get(id) ?? sessions.get(key) ?? { key: null, durable: false, running: false, approvals: new Set(), prompts: new Map() };
    if (key) session.key = key;
    session.durable ||= Boolean(durable);
    sessions.set(id, session);
    if (key) sessions.set(key, session);
    while (sessions.size > 512) {
      // Bound retained metadata; unrecognized selections remain unbound.
      sessions.delete(sessions.keys().next().value);
    }
  }
  function request(packet) {
    if (!packet || typeof packet.method !== 'string') return;
    if (typeof packet.id !== 'string' && typeof packet.id !== 'number') return;
    const selected = syncActivitySelection();
    const acceptance = branchAcceptance;
    clearBranchAcceptance();
    if (acceptance && packet.method === 'session.close' && packet.params?.session_id === acceptance.parentId && selectionVersion === acceptance.selectionVersion && selected === acceptance.selection) {
      // The guarded TUI callback closes its parent before switching sid. A successful
      // branch response alone does not prove that the callback accepted the result.
      selection = acceptance.sessionId;
      scheduleSample();
    }
    if (!['session.create', 'session.resume', 'session.activate', 'session.branch', 'prompt.submit', 'approval.respond', 'clarify.respond', 'secret.respond', 'sudo.respond'].includes(packet.method)) return;
    const requestId = packet.params?.request_id;
    const sessionId = packet.params?.session_id ?? [...sessions].find(([, session]) => session.prompts.has(requestId))?.[0];
    const activity = sessions.get(sessionId);
    pending.set(packet.id, {
      method: packet.method, sessionId, selectionVersion,
      activity, prompt: activity?.prompts.get(requestId), approvals: activity ? [...activity.approvals] : [],
      requestId: packet.params?.request_id,
      all: packet.params?.all === true,
      branchSequence: packet.method === 'session.branch' ? ++branchSequence : undefined
    });
    if (pending.size > 256) pending.delete(pending.keys().next().value);
  }
  function response(packet) {
    if (packet?.method === 'event') activityEvent(packet.params);
    if (packet?.method === 'event' && packet.params?.type === 'session.info') {
      const params = packet.params;
      // Metadata alone does not prove that a draft has been persisted or selected.
      remember(params.session_id, params.payload?.stored_session_id, false);
      scheduleSample();
      return;
    }
    const call = pending.get(packet?.id);
    if (!call) return;
    pending.delete(packet.id);
    if (packet.error || !packet.result || typeof packet.result !== 'object') return;
    const r = packet.result;
    if (call.method === 'session.create') remember(r.session_id, r.stored_session_id ?? r.session_key, false);
    if (call.method === 'session.resume') remember(r.session_id, r.resumed ?? r.session_key, true);
    if (call.method === 'session.activate') {
      const known = sessions.get(r.session_key);
      remember(r.session_id, r.session_key, known?.durable || r.message_count > 0);
      const session = sessions.get(r.session_id);
      if (session) {
        session.running = r.running === true || r.status === 'working' || r.status === 'waiting';
        // The TUI writes its foreground file after receiving the response. Retain
        // this snapshot for that selection; the response itself cannot select it.
        if (isForeground(r.session_id)) {
          reportActivityWaiting(session);
        }
      }
    }
    if (call.method === 'session.branch' && typeof r.session_id === 'string' && r.session_id) {
      const selected = readSelection();
      const parent = sessions.get(call.sessionId);
      remember(r.session_id, null, true);
      if (call.branchSequence === branchSequence && call.selectionVersion === selectionVersion && (selected === call.sessionId || (parent && sessions.get(selected) === parent))) {
        clearBranchAcceptance();
        branchAcceptance = { parentId: call.sessionId, sessionId: r.session_id, selection: selected, selectionVersion };
        // Accepted callbacks send session.close in the response's promise microtasks.
        // Expire at the next event-loop boundary so a later unrelated close cannot
        // accept a discarded branch. Subsequent explicit file writes still take priority.
        branchAcceptanceExpiry = setImmediate(clearBranchAcceptance);
      }
    }
    if (call.method === 'prompt.submit' && r.status === 'streaming') {
      const session = sessions.get(call.sessionId);
      if (session) session.durable = true;
    }
    if (['approval.respond', 'clarify.respond', 'secret.respond', 'sudo.respond'].includes(call.method) && call.activity && ((Number.isSafeInteger(r.resolved) && r.resolved > 0) || r.status === 'ok')) {
      const session = call.activity;
      // Resolve only waits captured by this request. A late response must not
      // erase a new turn's waits, even when the foreground changed meanwhile.
      if (call.prompt && session.prompts.get(call.requestId) === call.prompt) session.prompts.delete(call.requestId);
      if (call.method === 'approval.respond' && Number.isSafeInteger(r.resolved) && r.resolved > 0) {
        const count = call.all ? call.approvals.length : r.resolved;
        for (const approval of call.approvals.filter(approval => session.approvals.has(approval)).slice(0, count)) session.approvals.delete(approval);
      }
      if (isForeground(call.sessionId) && sessions.get(call.sessionId) === session) reportActivityWaiting(session);
    }
    scheduleSample();
  }
  function lines(consume) {
    const decoder = new StringDecoder('utf8');
    let buffer = '';
    let dropping = false;
    return chunk => {
      try {
        const text = typeof chunk === 'string' ? chunk : decoder.write(chunk);
        for (const part of text.split(/(\n)/)) {
          if (part === '\n') {
            if (!dropping && buffer) { try { consume(JSON.parse(buffer)); } catch {} }
            buffer = ''; dropping = false;
          } else if (!dropping) {
            if (buffer.length + part.length > 8 * 1024 * 1024) { buffer = ''; dropping = true; }
            else buffer += part;
          }
        }
      } catch { /* Unknown protocol must not affect the gateway stream. */ }
    };
  }
  childProcess.spawn = function (...args) {
    const argv = args[1];
    const isGateway = Array.isArray(argv) && argv.some((arg, i) => arg === '-m' && argv[i + 1] === 'tui_gateway.entry');
    if (isGateway) {
      // Do not preload the observer into tools or Node subprocesses of the gateway.
      const strip = env => {
        if (typeof env?.NODE_OPTIONS === 'string') env.NODE_OPTIONS = env.NODE_OPTIONS.replace(/--import=("[^"]*"|'[^']*'|[^\s]+)/g, (option, reference) => {
          try {
            const url = reference.startsWith('"') ? JSON.parse(reference) : reference.replace(/^'|'$/g, '');
            return realpathSync(fileURLToPath(url)) === realpathSync(fileURLToPath(import.meta.url)) ? '' : option;
          } catch { return option; }
        }).trim();
        if (env) for (const key of ['CLEANCODE_PROVIDER_ACTIVITY_PROVIDER', 'CLEANCODE_PROVIDER_ACTIVITY_TOKEN', 'CLEANCODE_PROVIDER_ACTIVITY_URL']) delete env[key];
      };
      strip(process.env);
      if (args[2]?.env) { args[2] = { ...args[2], env: { ...args[2].env } }; strip(args[2].env); }
    }
    const child = Reflect.apply(originalSpawn, this, args);
    if (isGateway && child.stdin && child.stdout) {
      gateway = child;
      sessions.clear();
      pending.clear();
      clearBranchAcceptance();
      selection = undefined;
      selectionStamp = undefined;
      selectionVersion++;
      syncActivitySelection();
      const readRequest = lines(packet => { if (gateway === child) request(packet); });
      const readResponse = lines(packet => { if (gateway === child) response(packet); });
      const originalWrite = child.stdin.write;
      child.stdin.write = function (chunk, ...rest) {
        readRequest(chunk);
        return Reflect.apply(originalWrite, this, [chunk, ...rest]);
      };
      child.stdout.on('data', readResponse);
      child.once('close', () => {
        if (gateway === child) {
          clearBranchAcceptance();
          sample();
          unwatchFile(activeFile, sample);
          gateway = undefined;
          pending.clear();
          sessions.clear();
          reportActivity('unavailable');
        }
        child.stdout.off('data', readResponse);
        child.stdin.write = originalWrite;
      });
      unwatchFile(activeFile, sample);
      watchFile(activeFile, { persistent: false, interval: 50 }, sample);
      process.removeListener('beforeExit', sample);
      process.once('beforeExit', sample);
    }
    return child;
  };
  syncBuiltinESMExports();
}
`
