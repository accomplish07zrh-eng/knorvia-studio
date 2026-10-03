# Server lifecycle owner — 2026-10-02

Baseline: `f25b931164ee6287167e965e9da7a7586131b264` on `recovery/independent-logging-20260930-0456`.
Scope: seven files under packages/server/src: stdio-lifecycle.ts, stdio.ts,
stdioServices.ts, entry-stdio.ts, http.ts, entry-http.ts, hostCapability.ts.
The server architecture module is unmanaged; context reports no module contract.
No dependency, permission, authentication policy, remote deployment, or persistence
format changes. No license decision is made by this lane.

## Ownership and implementation boundary

A fresh internal author receives this behavior/API document only, with no inherited
conversation, implementation files, old patches, or baseline test implementation.
The root observer has read the seven baseline files to extract this contract and
will independently validate the candidate against baseline observations. This is
bounded author separation, not an assertion that the entire project is clean-room.
Author writes complete implementations of all seven files, not extractions from
existing implementations. Dependencies remain their existing implementations.

```mermaid
sequenceDiagram
  participant Input as stdin / process signal
  participant Owner as Process lifecycle owner
  participant RPC as Stdio connection owner
  participant Scope as Agent connection scope
  participant Services as Service collection
  Input->>Owner: EOF (code 0), error/signal (code 1)
  Owner->>RPC: stop; immediately remove RPC admission
  RPC->>Scope: dispose (await)
  RPC->>RPC: dispose socket in finally
  Owner->>Services: dispose after RPC settles or budget expires
  Owner->>Owner: exit after disposal settles or budget expires
```

The process lifecycle owner alone holds shutdown admission and exit severity.
The stdio connection owner alone holds its memoized stop promise. HTTP creates
one capability store per server; pending remote connections retain the baseline
module-wide registry, and each remote id is consumed on first WebSocket open.
Agent services still own sessions; no new business state or queues are introduced.
Desktop is continuous/trusted-host-relay; browser connections remain
web-remote-replayable/terminal-client. No replay or lease logic is reimplemented.

## Stdio lifecycle API and observations

Export registerStdioProcessLifecycle(options): void. Options: stdin: Node Readable;
signalSource with on(signal, listener); log(...unknown[]): void;
stopRpc(): Promise<void>; dispose(): Promise<void>; exit(code): never|void;
optional shutdownTimeoutMs, rpcStopTimeoutMs, serviceDisposeTimeoutMs.
Defaults: RPC 1000ms; disposal 3500ms. Specific phase option wins over legacy
shutdownTimeoutMs, then default. Clamp budgets with Math.max(value, 0).

Register stdin end and error plus SIGHUP, SIGTERM, SIGINT. End logs
`stdin closed, shutting down`, requests code 0. Error logs
`stdin error, shutting down`, original error as second argument, requests code 1.
Signals log `termination signal received, shutting down`, signal as second
argument, request code 1. Every event logs even after shutdown starts; only the
first event starts cleanup. Later events can raise requested exit code to 1.
Call stopRpc immediately during event delivery; await its outcome or a referenced
timer, then call dispose, await its independently referenced timer/outcome, then
log `stdio shutdown completed`, {exitCode}, then exit once. Phase rejection logs
`stdio shutdown RPC stop failed` or `stdio shutdown cleanup failed` plus unchanged
error identity, raises code to 1, and proceeds. Timeout logs
`stdio shutdown timed out`, {phase: 'rpc-stop'|'service-dispose', timeoutMs}, raises
code to 1 and proceeds. Clear settled phase timer. Late rejected operations must
remain observed, without a second exit. No inactivity timer. Preserve existing
failure boundary: operations are typed promise-returning; synchronous throw is
not normalized into the normal rejection path by the baseline.

## Stdio transport and connection API

Export wrapStdio(): ISocket and createStdioServer(services: ServiceCollection).
Use @knorvia/rpc public Emitter, VSBuffer, SocketProtocol, ChannelServer, ISocket.
ISocket: onData event<VSBuffer>, onClose event<void>, onEnd event<void>, write,
end, drain Promise<void>, dispose. On each stdin data, deliver a VSBuffer wrapping
a new Uint8Array(chunk), copying bytes. Each stdin end OR error fires onClose then
onEnd (including repeated events; error value is not forwarded through these
void events). write converts VSBuffer.buffer to Node Buffer and writes stdout;
end ends stdout; dispose destroys stdin. drain resolves immediately when stdout
writableNeedDrain is false; otherwise waits for a one-time drain event. No extra
logging or frame serialization. SocketProtocol remains the framing owner.

createStdioServer constructs that socket, SocketProtocol(socket), and
ChannelServer(protocol, 'stdio'). Query services.getOptional(IKnorviaAgentService).
When present createKnorviaAgentConnectionScope(agentService, {connectionId:
'server-stdio-'+randomUUID(), clientMode:'desktop-continuous', role:'trusted-host-relay'}).
Expose via services.exposeOnChannelServer(channelServer, Map override mapping
IKnorviaAgentService.channelName to scope.service; empty Map if absent).
Return {stop}. First stop synchronously calls channelServer.dispose before scope
disposal starts. Await optional scope.dispose, always socket.dispose in finally.
Repeated stop returns identical Promise, including after rejection. socket.onClose
calls stop without awaiting. No new service disposal here; entry owner does that.

## Service composition

Export createStdioServices(options) where env optional Record<string,string|undefined>,
knorviaBuiltinProviderConfigFilePath required string, agentCommandResolver optional
KnorviaAgentCommandResolver from @knorvia/services/node. Use env ?? process.env.
Call parseServiceAuthorityMode(env) from @knorvia/shared unchanged. Network options
are undefined unless env[KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY]?.trim()
is exactly '1'. Then set {httpProxy: trimmed env[KNORVIA_REMOTE_HTTP_PROXY_ENV_KEY]
|| undefined, noProxy: trimmed env[KNORVIA_REMOTE_NO_PROXY_ENV_KEY] || undefined}.
Call createLocalServices from @knorvia/services/node with provider path,
serviceAuthorityMode: parse result.mode, agentCommandResolver, remoteAgentNetwork.
Return {authorityModeParseResult, services}, preserving object identities.

## Stdio entry

Imports existing public shared types HelloMessage, HelloAckMessage and values
SERVICE_AUTHORITY_MODE_ENV, KNORVIA_VERSION, formatLogPrefix, formatZodError,
helloAckMessageSchema. Provider config helpers from ./bundledBuiltinProviderConfig.js.
All console.log/info/warn/debug calls must route to console.error without a prefix.
Entry's own log uses console.error(formatLogPrefix('knorvia-server:stdio',process.pid),...args).
--version anywhere in argv writes KNORVIA_VERSION+'\n' to stdout and exits 0 before
hello or services. Otherwise stdout first gets JSON plus newline of {type:
'knorvia-hello',version,platform:process.platform,arch:process.arch,pid:process.pid}.
Wait for ack: 10s timer rejecting Error('Handshake timeout: no hello-ack received within 10s').
Accumulate each input chunk.toString('utf-8') into text; first newline terminates
ack; trim first line, remove data listener and clear timer before parsing. JSON.parse
then helloAckMessageSchema.safeParse; failure Error('Invalid hello-ack: '+
formatZodError(result.error)); parsing exceptions Error('Failed to parse hello-ack: '+err).
Valid ack yields schema data and unshifts any remaining text as Buffer.from(text,'utf-8').
This lane preserves the baseline text decoder boundary, including its known lack
of arbitrary binary suffix and split UTF-8 protection; no claim of fixing that.
Timeout does not remove the input listener in baseline; preserve frozen behavior.

Log `client connected: ${ack.clientId} (v${ack.version})`; materialize provider config
with {environmentConfigRoot:getAppConfigDir(),content:readBundledKnorviaBuiltinProviderConfig()}.
Compose createStdioServices({env:process.env,knorviaBuiltinProviderConfigFilePath}).
If parse.invalidRawValue is truthy log `${SERVICE_AUTHORITY_MODE_ENV}=${invalidRawValue} 非法，按默认本机 Environment 权威模式启动`.
Create stdio server then register lifecycle: stdin process.stdin, signalSource process,
log, stopRpc server.stop, dispose via disposeServiceResourcesAndWait(services),
exit via process.exit. Only after registration log `stdio mode ready`.
Fatal main rejection logs 'fatal:', same error, then process.exit(1).

## Capability API (unchanged policy)

Export DEFAULT_HOST_CAPABILITY_TTL_MS=30000, interfaces HostCapabilityStoreOptions
{ttlMs?:number, now?:()=>number, createCapability?:()=>string}, HostCapabilityStore
{issue():ServerRemoteHostCapability, consume(capability:string|undefined):boolean},
createHostCapabilityStore(options={}): HostCapabilityStore.
Defaults now Date.now, generator randomBytes(32).toString('base64url').
issue reads clock once, purges expiry <= now, obtains generated string, stores
expiry now+ttlMs (including zero, negative, NaN; no normalization), returns
{capability,expiresAt}. Duplicate generator value replaces prior expiry.
consume falsy token returns false without reading clock. Otherwise reads clock,
looks up and deletes token before checking, purges expired entries, returns true
iff an expiry was present and > now. In-memory only, single use, per-server store.

## HTTP API and transport

Export createHttpServer(services:ServiceCollection, port=3030, options={}) returning
the Node server from @hono/node-server serve. Options optional serverId,name,host,
authRequired,authToken,spaFallback,staticRoot,workspaces:ServerRemoteWorkspaceInfo[].
Use Hono, createNodeWebSocket({app}) yielding injectWebSocket,upgradeWebSocket.
serve({fetch:app.fetch,hostname:options.host,port}, callback); callback reads
server.address(), gets object address.port or requested port, logs
http://${options.host?.trim()||'localhost'}:${port} via console.log prefix
formatLogPrefix('knorvia-server:http',process.pid). injectWebSocket(server) then return.

WebSocket adapter uses Emitter/VSBuffer, on each message accepts Buffer or converts
other raw with Buffer.from(raw as ArrayBuffer), then copies via new Uint8Array.
Each close/error fires close then end; write sends buffer.buffer only at readyState
=== ws.OPEN; end/dispose call ws.close(); drain already resolved.
Create SocketProtocol, ChannelServer(protocol,'server'), wrap in LoggingChannelServer(raw,log).
Optional agent scope uses id 'server-ws-'+randomUUID(), requested clientMode and role
trusted-host-relay for desktop-continuous else terminal-client. Expose same override Map.
On close initiate scope.dispose (do not await), then raw ChannelServer.dispose.
Preserve this HTTP cleanup order (it differs from stdio). Do not add disposal of
services or remote backend on WS close; this is a frozen baseline limitation.

## HTTP routing, in order

If options.authToken?.trim() truthy, install '*' middleware. For every request,
query token exact-equals the trimmed configured token: set Set-Cookie to
knorvia_lite_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax and
consider valid. Otherwise parse Cookie segments split ';', split each at first '=',
trim name/value, ignore invalid/empty names, last duplicate wins, no percent decode;
compare knorvia_lite_token value to token. Protect exactly '/ws', prefix '/ws/',
prefix '/api/' only; protected invalid gets JSON {error:'Unauthorized'} status401;
public continues even if invalid. No new token/security policy.

GET /api/server-info JSON: serverId options.serverId.trim || trimmed env
KNORVIA_SERVER_ID || hostname() || 'knorvia-server'; optional name options.name.trim
|| trimmed KNORVIA_SERVER_NAME (omit if empty); version KNORVIA_VERSION,
protocolVersion SERVER_REMOTE_PROTOCOL_VERSION; authRequired options.authRequired
?? Boolean(trimmed KNORVIA_SERVER_TOKEN) (not authToken); workspaces options.workspaces
as-is if supplied, else [{path:trimmed KNORVIA_SERVER_WORKSPACE || process.cwd(),
label:basename(path)||path}]; capabilities desktopContinuous,websocketRpc,
processResourceTelemetry all true. Re-evaluate info on requests.
POST /api/rpc-host-capability returns store.issue().
GET /ws upgrades with web-remote-replayable mode; ignore any obsolete mode headers.
/ws/host middleware consumes c.req.header(KNORVIA_RPC_HOST_CAPABILITY_HEADER); failure
JSON {error:'Invalid or expired host capability'} 401. GET then upgrades with
desktop-continuous mode. Capability consumed even when upgrade later fails.
POST /api/connect-remote: await c.req.json then remoteTargetSchema.safeParse;
invalid -> {error:'Invalid request body: '+formatZodError(error)} 400. Parsing JSON
exceptions remain Hono's error boundary. On valid data, try await createRemoteBackend(data),
await connectRemote(backend), choose id Math.random().toString(36).slice(2)+Date.now().toString(36),
store in module registry and return {id}. Failure -> {error: Error.message or String(err)} 500.
GET /ws/remote/:id upgrade: on open missing id closes (4000,'Missing remote connection id'),
unknown closes (4004,'Remote connection not found'); found removed immediately, then
new ServiceCollection().register IFileService/fileService, IGitService/gitService,
ISystemService/systemService, ITerminalService/terminalService from connection.services,
setup WebSocket channels in web-remote-replayable mode. Do not call real remote systems in tests.

When trimmed staticRoot exists register GET '*' last. Root resolve(staticRoot),
'/' maps to '/index.html'; decodeURIComponent(pathname), remove leading '/' then
resolve against root. Containment uses relative(root,candidate): empty OR neither
startsWith('..') nor includes('..'+sep). Reject outside. stat file -> use; stat dir ->
try its index.html and only return if file, otherwise null; filesystem exceptions
fall through to SPA fallback. Fallback default true; only allowed for paths not
protected by same /api/ or /ws rules; root index must stat as file. If no file,404.
Read file asynchronously, status200, cache no-cache if filePath.endsWith('index.html'),
otherwise 'public, max-age=31536000, immutable'. MIME lowercased ext:
.css text/css; charset=utf-8; .html text/html; charset=utf-8; .js text/javascript; charset=utf-8;
.json/.map application/json; charset=utf-8; .txt text/plain; charset=utf-8;
.gif image/gif; .ico image/x-icon; .jpg/.jpeg image/jpeg; .png image/png; .svg image/svg+xml;
.wasm application/wasm; .webp image/webp; .woff font/woff; .woff2 font/woff2;
otherwise application/octet-stream. Preserve filesystem/path behavior, no policy changes.

## HTTP entry

Materialize bundled provider config with getAppConfigDir and bundled read as stdio.
Then port Number(process.env.PORT)||3030; host trimmed KNORVIA_SERVER_HOST ||
trimmed HOST || undefined; staticRoot trimmed KNORVIA_WEB_STATIC_ROOT || undefined;
authToken trimmed KNORVIA_SERVER_AUTH_TOKEN || undefined. createLocalServices with
only provider path; createHttpServer(services,port,options) where host if truthy,
staticRoot plus spaFallback:true if truthy, authToken plus authRequired:true if truthy.
Catch startup rejection: console.error('[knorvia-server:http] startup failed',error)
and process.exitCode=1. No extra process shutdown behavior is added.

## Acceptance and evidence

The latest user instruction supersedes the initial test plan: prioritize
implementation and skip routine tests during development. Aggregate acceptance is
deferred to final integration. The only planned executed test is a three-case
capability safety check, since this owner includes the existing capability gate:
single use and expiry boundary, per-store isolation, and default entropy/TTL.
Run it against the unchanged baseline and then the replacement. Record raw
outputs and exact baseline hashes. Do not run broad builds, full suites or a
transport equivalence matrix. Review the remaining behavior contract statically;
mark runtime framing, backpressure, HTTP/native listeners, entry boot and scoped
full typechecking unrun. Minimal changed-file lint and syntax diagnostics may be
used to catch concrete authored integration defects. Native runtime success must
not be inferred from injected or syntax checks.

No credentials, real user data, external servers, remote backend execution,
Library access or alternate Library403 route. Do not loosen the sandbox on EPERM.
Record frozen limitations separately from executed failures. No MIT or global
provenance edits in this lane.

## Bounded author clarifications

During static review the observer clarified that lifecycle callbacks are captured
at registration and invoked without an options receiver. A synchronous stopRpc
throw occurs within the async shutdown chain (rejected promise), rather than
escaping synchronously from stdin event delivery. signalSource accepts the three
registered signals. The four stderr console aliases share one forwarding function.
HTTP comparisons use URL pathname/searchParams semantics; a relative static root
is resolved per request. Remote id is captured at upgrade-factory invocation,
before WebSocket onOpen. Explicit workspace arrays bypass cwd fallback evaluation.
These are baseline compatibility details, not new behavior.
