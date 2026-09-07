/** A launch-local official OpenCode plugin. Only routing metadata leaves the CLI. */
export const openCodeReporterPluginScript = String.raw`
import { createServer } from 'node:http';
const reportedEvents = new Set(['session.created','session.status','session.idle','session.error','session.deleted','permission.asked','permission.updated','permission.replied','question.asked','question.replied','question.rejected']);
export const CleanCodeOpenCodeReporterPlugin = async ({client,directory}) => {
  // Capture launch credentials: an obsolete instance must never follow replacement env values.
  const url = process.env.CLEANCODE_OPENCODE_REPORTER_URL;
  const token = process.env.CLEANCODE_OPENCODE_REPORTER_TOKEN;
  const mcpToken = process.env.CLEANCODE_OPENCODE_MCP_TOKEN;
  let activeSession;
  let closed = false;
  let server;
  const accepted = new Set();
  const pending = new Map();
  const lifetime = new AbortController();
  let activation = 0;
  const report = async event => {
    if (!url || !token || closed) return;
    await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({directory,event}),signal:AbortSignal.timeout(3000)}).catch(()=>{});
  };
  const activate = async sessionID => {
    if (typeof client.session?.get !== 'function' || closed) return;
    const current = ++activation;
    const result = await client.session.get({path:{id:sessionID},query:{directory}}).catch(()=>null);
    const info = result?.data;
    if (closed || current !== activation || !info || info.parentID !== undefined) return;
    activeSession = sessionID;
    await report({type:'cleancode.session.activated',properties:{info}});
  };
  const close = () => { closed = true; lifetime.abort(); server?.close(); server?.closeAllConnections(); };
  if (process.env.CLEANCODE_OPENCODE_NATIVE_MESSAGES === '1' &&
      ['get','messages','status','promptAsync'].every(name => typeof client.session?.[name] === 'function')) {
    server = createServer(async (request,response) => {
      if (request.headers.authorization !== 'Bearer '+token || request.url !== '/cleancode-inbox') { response.writeHead(401).end(); return; }
      if (request.method === 'DELETE') { response.writeHead(204).end(); close(); return; }
      if (request.method !== 'POST' || closed) { response.writeHead(405).end(); return; }
      try {
        let requestBody = '';
        for await (const chunk of request) { requestBody += chunk; if (requestBody.length > 4096) { response.writeHead(413).end(); return; } }
        const input = JSON.parse(requestBody);
        if (input.sessionID !== activeSession || typeof input.notificationId !== 'string' || typeof input.reminder !== 'string') { response.writeHead(409).end(); return; }
        const target = activeSession;
        const key = target + ':' + input.notificationId;
        if (accepted.has(key)) { response.writeHead(204).end(); return; }
        const submit = async () => {
          const status = await client.session.status({query:{directory},signal:lifetime.signal});
          if (status.error || !status.data || (status.data[target] && status.data[target].type !== 'idle')) return 409;
          // Only native routing metadata is used. Message parts/history never leave the CLI.
          const messages = await client.session.messages({path:{id:target},query:{directory},signal:lifetime.signal});
          if (messages.error || !Array.isArray(messages.data)) return 503;
          const previous = messages.data.findLast(message => message.info?.role === 'user')?.info;
          if (closed || target !== activeSession) return 409;
          // Newer messages nest variant in model; the prompt API still takes it separately.
          const model = previous?.model;
          const body = {parts:[{type:'text',text:input.reminder}],
            ...(previous ? {agent:previous.agent,
              model:model && {providerID:model.providerID,modelID:model.modelID},
              variant:model?.variant ?? previous.variant} : {})};
          const result = await client.session.promptAsync({path:{id:target},query:{directory},body,signal:lifetime.signal});
          if (result.error || (result.response && !result.response.ok)) return 503;
          accepted.add(key);
          if (accepted.size > 4096) accepted.delete(accepted.values().next().value);
          return 204;
        };
        // A lost HTTP response or concurrent retry must share the native acceptance.
        if (!pending.has(key)) pending.set(key, submit().catch(()=>503).finally(()=>pending.delete(key)));
        response.writeHead(await pending.get(key)).end();
      } catch { if (!response.headersSent) response.writeHead(503).end(); }
    });
    const listening = await new Promise(resolve => { server.once('error',()=>resolve(false)); server.listen(0,'127.0.0.1',()=>resolve(true)); });
    if (listening) {
      server.unref();
      await report({type:'cleancode.delivery.register',properties:{url:'http://127.0.0.1:'+server.address().port+'/cleancode-inbox'}});
    } else {
      server.close();
      await report({type:'cleancode.delivery.unavailable',properties:{}});
    }
    const sessionID = process.env.CLEANCODE_OPENCODE_SESSION_ID;
    // Native routes may await plugin initialization. Do not await a route here.
    if (sessionID) void activate(sessionID);
  } else if (process.env.CLEANCODE_OPENCODE_NATIVE_MESSAGES === '1') {
    await report({type:'cleancode.delivery.unavailable',properties:{}});
  }
  return {
    // Early releases parse inline JSON without env expansion. The official
    // config hook runs before MCP initialization; resolve only our owned header.
    config: async config => {
      const headers = config.mcp?.cleancode?.headers;
      if (mcpToken && headers?.Authorization === 'Bearer {env:CLEANCODE_OPENCODE_MCP_TOKEN}')
        headers.Authorization = 'Bearer ' + mcpToken;
    },
    event: async ({event}) => {
      if (event?.type === 'server.instance.disposed') { close(); return; }
      if (!reportedEvents.has(event?.type)) return;
      if (event.type === 'session.created' || event.type === 'session.deleted') activation++;
      if (event.type === 'session.created' && event.properties?.info?.parentID === undefined) activeSession = event.properties.info.id;
      if (event.type === 'session.deleted' && event.properties?.info?.id === activeSession) activeSession = undefined;
      await report(event);
    },
    'chat.message': async ({sessionID}) => { await activate(sessionID); }
  };
};
`
