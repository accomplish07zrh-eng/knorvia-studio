# Backend factory and connection lifecycle complete owners

Captured baseline b088fe3883d162e61700a769faec4a624242678c. Source-exposed curator
owns this functional/API packet; fresh author must not inspect inherited code.
Scope create-backend.ts and connect.ts; retain backend.ts public declarations,
excluded SSH/auth/security/permission-repair/cache/CDN/network implementations.
Write whole replacements in /tmp/knorvia-backend-connect-authored only. Read
only this packet, root AGENTS.md and architecture-governance SKILL.md. No guidance
discovery, inherited implementation/tests/history/dependency/prior-author reads.
No tests/builds/real process/network/backend/credentials/deployment execution.

## Public imports and declarations retained

Use same-folder ./backend.js, ./stdio-socket.js, ./handshake.js, ./deploy.js,
./posixShell.js, ./wslProxy.js; support gate canonical
@knorvia/server/remote/remotePlatformSupport.js. Other public packages:
@knorvia/rpc SocketProtocol(socket), ChannelClient(protocol), each dispose():void;
@knorvia/services IServiceAccessor type; @knorvia/client RemoteServiceAccess(client)
implements IServiceAccessor. @knorvia/shared exports RemoteTarget type and env
constants named below, formatLogPrefix(scope:string,pid:number):string.
wrapStdioStream(stream) returns ISocket with dispose():void (synchronous stdin EOF).
performHandshake(stream,clientId:string,timeout?:number) => Promise<{hello:{version:string},remaining:Buffer}>.
deployServer(backend,env,options?:DeployOptions):Promise<void>; DeployOptions is
retained public type with optional signal and existing deployment options.
assertSupportedRemoteEnvironment(env) => void. quotePosixShellArg(value:string)
=> string; formatWslProxyForLog(url:string)=>string. Do not inline these ports.

Retained backend declarations: RemoteEnvironment {platform:string;arch:string};
StdioStream {stdin:NodeJS.WritableStream;stdout:NodeJS.ReadableStream;
stderr:NodeJS.ReadableStream;onClose:Event<number>}; Event registers callback and
returns IDisposable. IRemoteBackend extends IDisposable:
detect():Promise<RemoteEnvironment>; exec(cmd):Promise<StdioStream>;
upload(local,remote,options?):Promise<void>; exists(path):Promise<boolean>;
readFile(path):Promise<string>; dispose():void;
optional resolveRuntimeProxy(proxy:string):Promise<string>;
optional disposeAndWait({graceTimeoutMs?,killWaitTimeoutMs?}?):Promise<void>;
optional onDidDisconnect:Event<{reason:'error'|'close'|'end';error?:Error}>.

## Factory contract

Export async createRemoteBackend(target:RemoteTarget):Promise<IRemoteBackend>.
Switch target.kind with only ssh,wsl,docker branches; no default error/fallback.
SSH branch FIRST await dynamic import ./ssh-backend.js then inspect current
target.privateKeyPath. If truthy, current path.replace(/^~/,homedir()) and await
node fs/promises readFile(keyPath) returning Buffer (no encoding). No content
validation/cache, reads only when requested. Local key variable starts undefined.
Then new SSHBackend with ordered property values read CURRENT target fields:
host, port, username, password, privateKeyPath, privateKeyPassphrase, privateKey.
Preserve key path including raw original spelling in constructor options.
No normalization beyond leading tilde replacement, no secret logging/policy.
WSL branch await dynamic import ./wsl-backend.js then new WSLBackend(target);
Docker similarly ./docker-backend.js and DockerBackend(target). Pass original
target reference, don't clone or snapshot before import await. No connection,
detect or runtime operation in factory. Node homedir from os, readFile from
fs/promises. Excluded SSH module may be IMPORTED by generated source at runtime,
but author/curator must not execute imports or read its implementation.

## Public connection interfaces and env filter

ConnectOptions extends DeployOptions: clientId?:string;handshakeTimeout?:number;
skipDeploy?:boolean;appVersion?:string;
remoteRuntimeEnv?:Record<string,string|undefined>;
remoteRuntimeNetwork?:RemoteRuntimeNetworkOptions;
onDidRemoteClose?:(event:{code:number})=>void.
RemoteRuntimeNetworkOptions {httpProxy?:string;noProxy?:string;authoritative?:boolean}.
RemoteConnection {services:IServiceAccessor;client:ChannelClient;dispose():void;
disposeAndWait(options?:{timeoutMs?:number}):Promise<void>}.

Shared exports used: SERVICE_AUTHORITY_MODE_ENV, KNORVIA_APP_VERSION_ENV,
KNORVIA_DESKTOP_CONTEXT_PROMPT_ENABLED_ENV, KNORVIA_DYNAMIC_WORKFLOW_MODE_ENV,
KNORVIA_REMOTE_HTTP_PROXY_ENV_KEY, KNORVIA_REMOTE_NO_PROXY_ENV_KEY,
KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY. The last three are names of
existing optional runtime launch env assignments; don't change authority policy.

Export RemoteRuntimeEnvKey union from ordered allowed tuple: 'KNORVIA_ENV',
'KNORVIA_BASE_URL','KNORVIA_ENDPOINT_ORIGIN', then desktop-context constant,
dynamic-workflow constant. RemoteRuntimeEnv=Partial<Record<RemoteRuntimeEnvKey,string>>.
pickRemoteRuntimeEnv(env:Record<string,string|undefined>):RemoteRuntimeEnv loops
only tuple keys in order, value=env[key]?.trim(); truthy -> assign trimmed value
into ordinary {}; whitespace/falsy skipped, unknown keys ignored. No env/process
read in pure filter. Preserve property access/trim failures; no generic policy.

## One owner and asynchronous admission

Factory owns selection/material constructor data only; connect initialization
owns one exclusive backend abort race; published connection owns RPC and stream
disposal. Distinct backendDisposed flags for initializer and published owner are
intentional; do not globally merge flags or add teardown catches. Stream-close
and backend-disconnect report into one published callback flag; initialization
promise does not become a second connection registry. Desktop direct-live stream
and mobile replay remain outside this bootstrap scope.

```mermaid
sequenceDiagram
  participant C as Caller
  participant O as Initialization owner
  participant B as Backend
  participant P as Published connection owner
  C->>O: connect(options)
  O->>B: detect / optional deploy / exec
  O->>B: handshake; unshift remaining
  O->>P: socket / protocol / channel / services
  alt initializing abort
    O->>B: dispose once, reject original abort reason
  else publish
    O-->>C: RemoteConnection
    C->>P: disposeAndWait
    P->>B: synchronous stdin EOF, await close/deadline, owned backend teardown
  end
```

Abort Error helper: if signal.reason instanceof Error return original Error;
otherwise new Error('Remote connection canceled') name='AbortError'. Each gate
receives current signal once and checks aborted then helper. Never wrap reason.

Export async connectRemote(backend,options?):Promise<RemoteConnection>. Snapshot
signal=options?.signal FIRST; initialization backendDisposed=false. dispose-once
sets flag BEFORE backend.dispose(), no exception guard. Pre-aborted: dispose
once then throw abort Error, BEFORE outer try/finally. Define initially no-op
removeAbortListener. In try START unchecked connection promise BEFORE listener.
No signal -> return await connecting (catch still tears down on failure).
Signal -> new abort Promise executor registers once event. onAbort: dispose once,
then reject abort Error (if dispose throws, rejection does not occur; preserve).
Set remove listener callback after registration. Create guarded connecting.then:
if snapshotted signal now aborted, connection.dispose() then throw abort Error;
otherwise connection. Await race [guardedConnecting,aborted] in that order.
Catch dispose initializer backend once then throw original (dispose failure can
replace). Finally remove listener. No extra post-registration aborted check,
no timeout or broad dispose of shared sessions; preserve existing race oddities.

## Unchecked initialization: exact sequence/logs

clientId = options?.clientId ?? `desktop-${Date.now()}` (empty id retained).
Private log uses console.log(formatLogPrefix('connectRemote',process.pid),...args).
Log 'detecting remote env...'; await backend.detect(); gate current options.signal;
log('detected:',env); support gate(env). Await network resolution below, no new
abort gate immediately after network resolution. If !options?.skipDeploy:
log 'deploying server...'; await deployServer(backend,env,options); gate current
signal; log 'deploy complete'. Log 'launching remote server...'; await backend.exec
(launch command below); gate current signal; log 'remote server exec started'.
Install stderr data callback chunk Buffer -> console.log(`[remote] ${chunk.toString().trimEnd()}`),
retained and no removal/truncation. Log 'performing handshake...'; await handshake
(stream,initial clientId,CURRENT options.handshakeTimeout); gate current signal;
log('handshake done, server version:',hello.version).
Truthy remaining && length>0 -> stream.stdout.unshift(remaining) BEFORE socket
data listener via wrapStdioStream. Then new SocketProtocol(socket), ChannelClient
(protocol), RemoteServiceAccess(client), in order.

Then create hasReportedRemoteClose=false,hasStreamClosed=false,streamClosed
Promise with captured resolver. report(code): if already reported return;
set flag first then CURRENT options?.onDidRemoteClose?.({code}). Callback failures
propagate. Subscribe optional backend disconnect BEFORE stream onClose; callback
reads event.error?.message, logs either
`remote backend disconnected: ${event.reason}: ${message}` when truthy message,
else `remote backend disconnected: ${event.reason}`; then report(-1). It does NOT
mark stream closed, resolve streamClosed or dispose owner. stream.onClose(code):
set hasStreamClosed=true, resolve streamClosed(), then report(code). Synchronous
close replay before disposal locals are initialized must remain supported.

## Published disposal: exact phase and Promise boundaries

disposalStarted=false; backendDisposed=false; inFlight:Promise<void>|null=null.
beginDisposal if flag return; set flag; optional backend-disconnect subscription
.dispose(); client.dispose(); protocol.dispose(); socket.dispose(), in this
synchronous order BEFORE any await. No catches; later phases don't run if throws.
disposeBackend: flag guard, flag before stream-close subscription.dispose(),
then backend.dispose(). Async disposeBackendAndWait: same guard/flag/subscription;
if backend.disposeAndWait truthy, await backend.disposeAndWait() NO forwarded
timeout options then return, otherwise backend.dispose(). Don't merge these two
paths or pre-defer stdin EOF.

Returned services/client are exact constructed refs. dispose(): beginDisposal
then disposeBackend, no async wait. disposeAndWait(disposeOptions): if inFlight
truthy return exact Promise; beginDisposal; if backendDisposed OR hasStreamClosed,
disposeBackend then return Promise.resolve() WITHOUT memoizing immediate case.
Otherwise timeoutMs=Math.max(disposeOptions?.timeoutMs??5000,0), preserving NaN/
Infinity semantics. Create/store async IIFE Promise: deadline Promise setTimeout
resolves literal 'timed-out'; race [streamClosed.then(()=> 'closed'), deadline];
if timer truthy clearTimeout; if timed-out log
`remote stdio close timed out after ${timeoutMs}ms`; await disposeBackendAndWait.
Return same inFlight Promise including rejection; do not finally reset it or
delay beginDisposal. If dispose() races waiting, backend flag prevents second
teardown; timer can still finish/log. No extra timer/error guards/unref.

## Network resolver and launch byte contract

Resolver async: if !network OR !backend.resolveRuntimeProxy return undefined,
even authoritative data then omitted for SSH/Docker unsupported backend. If
!network.httpProxy?.trim() return original network ref. Try await current
backend.resolveRuntimeProxy(network.httpProxy); if resolved !== CURRENT
network.httpProxy log('resolved remote runtime proxy via wsl-host-gateway',
formatWslProxyForLog(network.httpProxy),'->',formatWslProxyForLog(resolved));
return {...network,httpProxy:resolved}. Catch including log/spread failure:
log('remote runtime proxy resolution failed; using configured endpoint',
error instanceof Error?error.message:String(error)); return ORIGINAL network.
No new fallback requests, mutations, proxy/security policies or local env reads.

Launch env array initially ordered:
`${SERVICE_AUTHORITY_MODE_ENV}="desktop-attached-remote"`,
'KNORVIA_SERVER_RUNTIME_ROOT="$HOME/.knorvia-studio/server"'. Iterate entries
from pickRemoteRuntimeEnv(options?.remoteRuntimeEnv??{}) then append key=quoted
value. appVersion=options?.appVersion?.trim(); truthy append constant=quoted
trimmed version. If network?.authoritative truthy append authorityKey='1' EXACT
single quotes. Then if CURRENT httpProxy !==undefined append httpProxyKey=quoted
raw proxy (empty allowed); similarly noProxy. Don't trim network values here.
Full command `${envParts.join(' ')} ~/.knorvia-studio/server/node ~/.knorvia-studio/server/knorvia-server.cjs`.
Required launch string/quoting are generated output, never execute in author.

## Validation and provenance

Only scoped lint, syntax/transpile diagnostics and changed architecture. Ordinary
runtime suites, semantic types, build/native/backend/disposal/network matrices
deferred. One minimal injected safety check only for a concrete observed lifecycle
or write risk. No SSH implementation/auth/security edits, credentials use,
root helper changes, main/cross-lane merge or licence claim. Declared author
exclusion isn't OS isolation; source-derived packet and limited novelty remain
explicit curator limits for parent classification.

## Bounded static review corrections

Proxy and noProxy launch assignments must remain nested in the authoritative
guard alongside the authority marker. Initial candidate emitted them outside the
guard; curator identified this actual policy admission difference statically,
with no failing candidate execution claimed. Fresh author corrected from bounded
behavior description. One injected safety test on baseline and final candidate
checks absent proxy assignments when authority is false and presence when true.
All imports and backend/RPC/handshake/socket ports are virtual synthetic values,
no SSH/private-key/auth implementation or real connection/command/deployment is
loaded. JSON fake quoting does not validate native shell quoting.

Existing ReadableStream declaration lacks unshift; preserve a structural view of
the same stream, do not edit backend.ts. Abort helper reads reason for instanceof
and again for original Error return, retaining accessor timing. These two bounded
API/timing corrections were made by the author without additional source access.
