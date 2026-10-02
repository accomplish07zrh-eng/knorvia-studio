# Remote asset identity/decision owners — 2026-10-02

Sixth isolated PR9 batch. Baseline `2de79f27d2bb2cf2a003b408d2f7c155b78df42f`.
Exclusive production files: packages/server/src/remote/remoteAssetDeployDecision.ts
and remoteAssetLiveIdentity.ts. Do not modify remoteAssetCache, remoteAssetCdn,
remoteAssetNetwork, installer/backend/deploy callers or credentials/security.
Fresh GPT-6.1 Sol/high author reads this packet and repository guidance only;
source-exposed curator has read baseline and public dependency context. No old
implementation, tests, patches/history or dependency source goes to the author.
Whole owner outputs are candidates, with no novelty/licence classification.

## Dependencies and public types

All server dependency imports use @knorvia/server/remote/<name>.js.
backend.js: type RemoteEnvironment {platform:string;arch:string}; IRemoteBackend
has exists(path):Promise<boolean>, readFile(path):Promise<string>, exec(command):
Promise<StdioStream>. deployShared.js: REMOTE_BASE='~/.knorvia-studio/server';
DeployLoggers {log:(...unknown[])=>void;logWarn:(...unknown[])=>void};
waitForClose(stream):Promise<void> (delegate unchanged).
RemoteAssetDeployOptions fields: signal?:AbortSignal, releaseDir?:string|null,
resolveReleaseDir?:(componentIds?:string[],options?:{forceRefresh?:boolean})=>Promise<string|null>,
resolveComponentSha256?:(componentId:string)=>Promise<string|null>,
remoteCdnBaseUrl?:string, remoteCdnBaseUrls?:string[], remoteCacheDir?:string,
manifestRequestTimeoutMs?:number, remoteAssetNetwork?:RemoteAssetNetworkPort.
RemoteAssetNetworkPort is an opaque type import from remoteAssetNetwork.js.

remoteAssetCache.js public types:
RemoteAssetManifest {schemaVersion:number;appVersion:string;platformArch:string;
components:RemoteAssetManifestComponent[]}; component {id:string;version:string;
sha256:string;artifactPath:string;mount:string}; RemoteAssetManifestRef {manifest:
RemoteAssetManifest;releaseBaseCandidatesForComponents:string[]}.
fetchRemoteAssetManifestFromCdn(options,loggers):Promise<RemoteAssetManifest|null>;
fetchRemoteAssetManifestRefFromCdn(options,loggers):Promise<RemoteAssetManifestRef|null>.
Options here are {remoteCdnBaseUrl?,remoteCdnBaseUrls?,remoteCacheDir?,version:string,
platformArch:string,manifestRequestTimeoutMs?,remoteAssetNetwork?,refreshManifest?:boolean}.
selectRemoteAssetManifestComponents(manifest,componentIds?:string[]):RemoteAssetManifestComponent[].
resolveRemoteAssetComponentCacheVersion(version:string):string. Delegate all,
without copying implementation or adding normalization.
remoteAssetCdn.js: resolveRemoteCdnBaseUrls(options with optional baseUrl/baseUrls):string[];
buildReleaseBaseCandidates(baseUrls:string[],version:string):string[].

remoteAssetInstaller.js: RemoteAssetInstaller has readonly mode (includes
'remote-download'), installFile({componentId:string,sourceRelativePath:string,
remotePath:string,executable?:boolean,forceRefresh?:boolean}):Promise<void>.
LocalUploadAssetInstaller is the exported actual class; use instanceof exactly,
and its tryResolveLocalPath(componentIds:string[],sourceRelativePath:string):Promise<string|null>.
Do not instantiate it or substitute duck typing. Other installer methods are not
used here. posixShell.js: quotePosixPathArg(path):string and
buildWriteLiteralFileCommand(targetPath,content):string, delegated unchanged.
shared exports KNORVIA_VERSION. Live identity also imports readFile from
node:fs/promises and join from node:path for mock manifest path; no real calls in
validation. No dependency implementation reading necessary.

## Ownership

Each resolver factory owns one lazy promise for its transaction. Retain null and
rejection as well as success; no retry/reset/extra refresh. The fresh-ref resolver
owns pinned manifest plus component release candidates. It requests refresh once
and returns the SAME Promise and ref object on repeated calls. Installer remains
owner of materialization; these owners do not create another cache/network route.
Metadata operations are the existing single read/write path, with literal markers.

```mermaid
sequenceDiagram
  participant Caller
  participant Resolver as Transaction resolver
  participant Manifest as Existing manifest port
  participant Decision
  participant Backend as Existing backend/installer ports
  Caller->>Resolver: first identity request
  Resolver->>Manifest: fetch once (fresh ref: refreshManifest true)
  Manifest-->>Resolver: ref / null / original rejection
  Caller->>Resolver: repeated identity request
  Resolver-->>Caller: same pinned promise/ref
  Caller->>Decision: compare metadata or force/version decision
  Decision->>Backend: ordered exists/read; installation if required
  Decision->>Backend: write metadata only after successful install
```

## remoteAssetLiveIdentity.ts exported APIs

RemoteAssetIdentityResolverOptions interface: mockCdnDir?:string, remoteCdnBaseUrl?:string,
remoteCdnBaseUrls?:string[], remoteCacheDir?:string, manifestRequestTimeoutMs?:number,
remoteAssetNetwork?:RemoteAssetNetworkPort.
createFreshRemoteAssetManifestRefResolver(options,env,loggers):()=>Promise<RemoteAssetManifestRef|null>.
RemoteAssetComponentIdentity interface {sha256:string}.
RemoteAssetComponentMeta interface {id:string;version?:string;sha256?:string;
pendingRefreshAppVersion?:string;platformArch:string}.
RemoteAssetComponentIdentityDecision type {shouldDeploy:false}|{shouldDeploy:true;reason:string}.
checkRemoteAssetComponentIdentity(backend,options:{componentId:string;platformArch:string;
expectedIdentity:RemoteAssetComponentIdentity}):Promise<RemoteAssetComponentIdentityDecision>.
readRemoteAssetComponentMeta(backend,componentId:string):Promise<RemoteAssetComponentMeta|null>.
writeRemoteAssetComponentMeta(backend,meta:RemoteAssetComponentMeta):Promise<void>.
markRemoteAssetComponentRefreshPending(backend,options:{componentId:string;platformArch:string;
appVersion:string}):Promise<void>.
hasRemoteAssetComponentRefreshPending(backend,options:{componentId:string;platformArch:string}):Promise<boolean>.

Metadata directory `${REMOTE_BASE}/.asset-components`; path is direct string
`${directory}/${componentId}.json` (no validation/normalization/join).
Read: try backend.readFile then JSON.parse. Require id/platformArch strings;
if version,sha256,pendingRefreshAppVersion !==undefined, each must be string.
Any read/parse/property-access/type failure -> null. Empty required strings are
accepted. Return new object keys in order id, optional version if truthy, optional
sha256 if truthy, optional pendingRefreshAppVersion if truthy, platformArch.
No trimming, unknown field retention or extra backend.exists.
Write: if meta.version === 'unknown' AND !meta.sha256, return without any port call.
Otherwise await backend.exec(command), then await waitForClose(stream). Command
is `mkdir -p ${quotePosixPathArg(directory)}` joined with ' && ' to existing
buildWriteLiteralFileCommand(path(meta.id),JSON.stringify(meta)+'\n'). Serialize the
original meta object; do not clone/reorder/filter fields. No catch, wrapping,
chmod, temp-file or new cancellation behavior. Port errors propagate unchanged.
mark pending writes only {id:componentId,platformArch,pendingRefreshAppVersion:appVersion}
(order preserved), intentionally replacing previous metadata via same writer.
has pending reads once and returns Boolean(meta && matching id && matching
platformArch && meta.pendingRefreshAppVersion); do not compare app version.

Identity decision reads metadata once. Checks in order, stopping on first mismatch:
missing -> `remote component meta missing expected=${expectedIdentity.sha256}`;
id mismatch -> `remote component id mismatch remote=${remoteMeta.id} expected=${componentId}`;
platform mismatch -> `remote platform mismatch remote=${remoteMeta.platformArch} expected=${platformArch}`;
falsy SHA -> `remote component SHA missing expected=${expectedIdentity.sha256}`;
SHA comparison trims and lowercases both, mismatch ->
`remote SHA mismatch remote=${remoteMeta.sha256} expected=${expectedIdentity.sha256}`.
Mismatch returns {shouldDeploy:true,reason}; match {shouldDeploy:false}. No version
comparison, hash validation or fallback from legacy version-only metadata.

Fresh resolver factory is lazy: read mutable options/env only on first invocation,
not at factory creation. Memoize exact underlying Promise with nullish assignment.
Build platformArch `${env.platform}-${env.arch}` before branch/try.
Truthy mockCdnDir: inside try read join(mockCdnDir,'releases',KNORVIA_VERSION,
`manifest-${platformArch}.json`) utf8, JSON.parse with type assertion ONLY (no
validation), then return {manifest:parsed,releaseBaseCandidatesForComponents:
buildReleaseBaseCandidates(resolveRemoteCdnBaseUrls(options),KNORVIA_VERSION)}.
Any failure in that try warns
`[remote-assets] mock component manifest unavailable, fallback to release checks: ${String(error)}`
and returns null; no network fallback call.
Nonmock: try await fetchRemoteAssetManifestRefFromCdn with exactly forwarded
optional source/cache/deadline/network fields, version KNORVIA_VERSION,
platformArch, refreshManifest:true, and original loggers object. After fetch,
compute hasConfiguredManifestSource = Boolean(remoteCacheDir?.trim()) &&
(Boolean(remoteCdnBaseUrl?.trim()) || Boolean(remoteCdnBaseUrls?.some(base=>base.trim().length>0))).
Compute it even when ref is truthy; keep short-circuit order. If !ref && configured,
throw fresh Error(`[remote-assets] manifest not found for ${platformArch}: manifest-${platformArch}.json`).
Otherwise return ref unchanged. Catch warns
`[remote-assets] component manifest request failed: ${String(error)}` then rethrows
SAME error. Neither timeout, parse error nor configured-source 404 becomes null or
triggers a second request. loggers methods retain their loggers receiver.

## remoteAssetDeployDecision.ts exported APIs

RemoteAssetVersionResolverOptions has same optional fields as identity options.
createRemoteComponentVersionResolver(options,env,loggers):(componentId:string)=>Promise<string|null>.
Private DeployNodeRuntimeOptions extends RemoteAssetDeployOptions with
platformArch:string,force?:boolean,installer:RemoteAssetInstaller,expectedVersion?:string|null.
Private DeployNodePtyPrebuildOptions additionally has onlyIfMissing:boolean.
deployNodeRuntime(backend,options,loggers):Promise<void>.
deployNodePtyPrebuilds(backend,env,options,loggers):Promise<void>.
logDeployRequired(options:{loggers:Pick<DeployLoggers,'logWarn'>;installer:RemoteAssetInstaller;
componentId:string;reason:string}):void.

Version resolver: lazy memoized underlying manifest promise, including null/reject.
Truthy mockCdnDir yields null with no fetch/warn. Otherwise try await
fetchRemoteAssetManifestFromCdn with forwarded source/cache/deadline/network,
version KNORVIA_VERSION, platformArch `${env.platform}-${env.arch}` and loggers;
DO NOT add refreshManifest or forceRefresh. Catch warns component manifest request
failed (same text as above) and rethrows original. Per component call awaits memo
manifest; null -> null; selectRemoteAssetManifestComponents(manifest,[componentId])[0]?.version;
truthy version -> resolveRemoteAssetComponentCacheVersion(version), else null.
Selection/version normalization errors propagate without the fetch warning.
Each returned function call is async; outer promise identity is not guaranteed.

Version normalization used for deployment: truthy input delegates to cache-version
helper, otherwise null. Normalize expectedVersion BEFORE decision even if force.
Shared private decision checks in order:
force truthy -> deploy reason 'force deploy requested' without exists/meta;
await backend.exists(remotePath) false -> deploy `remote file missing path=${remotePath}`;
expectedVersion falsy -> deploy 'component version unavailable, using legacy full deploy'
if fallbackDeployWhenVersionUnknown, otherwise skip;
read metadata then missing -> `remote component meta missing expected=${expectedVersion}`;
id mismatch/platform mismatch use same templates as identity decision;
normalized remote.version differs from normalized expectedVersion ->
`remote version mismatch remote=${remoteMeta.version} expected=${expectedVersion}`;
otherwise skip. No SHA decision in this legacy version path.

logDeployRequired chooses action 'download required' only when installer.mode ===
'remote-download', else 'upload required'; call loggers.logWarn synchronously with
`[remote-assets] ${action}: component=${componentId} reason=${reason}`.

Node runtime: path `${REMOTE_BASE}/node`, component node-runtime, fallback true.
Skip -> log 'node runtime already matches, skip', return. Deploy -> logDeployRequired,
await installer.installFile({componentId:'node-runtime',sourceRelativePath:
`node/${platformArch}/node`,remotePath,executable:true}); then await write metadata
{id:'node-runtime',version:normalizedExpected??'unknown',platformArch}; log 'node install done'.
Do not pass forceRefresh or extra options to install. Errors stop subsequent ports/logs.

Node PTY: primary path `${REMOTE_BASE}/build/Release/pty.node`, spawn helper sibling
spawn-helper. component node-pty, fallback !onlyIfMissing. On deploy decision,
sourceRelativePath `node-pty/${platformArch}/pty.node`. If actual
LocalUploadAssetInstaller AND awaited tryResolveLocalPath(['node-pty'],source) is
falsy: logWarn `WARNING: no node-pty prebuild for ${platformArch}. Terminal will not work.`
then `Run: node scripts/prepare-prebuilds.mjs to prepare mock-cdn release assets.`;
no primary install/meta, but continue to Darwin helper handling. Otherwise
logDeployRequired, log 'installing node-pty prebuild...', installFile({componentId:
'node-pty',sourceRelativePath,remotePath:primary}) WITHOUT executable; write metadata
{id:'node-pty',version:normalizedExpected??'unknown',platformArch}; log 'node-pty install done'.
Skip decision logs 'node-pty prebuild already exists, skip'.

If env.platform !==literal 'darwin', return after primary phase. Otherwise helper
required when decision.shouldDeploy OR !(await backend.exists(helper)); short circuit
exists when primary deploy selected, including local prebuild unavailable case.
Helper source `node-pty/${platformArch}/spawn-helper`. LocalUpload class missing
source warns `WARNING: no node-pty spawn-helper for ${platformArch}. Terminal may fail to start.`
then same Run message, returns. Otherwise log 'installing node-pty spawn-helper...';
only if primary decision skip, logDeployRequired reason `remote file missing path=${helper}`;
installFile({componentId:'node-pty',sourceRelativePath,remotePath:helper,executable:true});
log 'node-pty spawn-helper install done'. Never write helper metadata. Not required
logs 'node-pty spawn-helper already exists, skip'. Preserve port/log order and error
identity. No new cancellation, hash/forceRefresh behavior or installer version calls.

## Evidence and deferred checks

No runtime tests/builds for this ordinary batch unless a concrete new identity/
data-safety defect needs one injected check. Use scoped static API/ordering review,
lint/syntax and changed architecture. Do not invoke real filesystem mock manifests,
network fetch, backend, installer/deployment or credentials. Record author/curator
access, baseline/author/candidate hashes and all deferred runtime, transaction,
refresh/force, platform, semantic-type and aggregate work honestly. No protected
root helper edits, cross-lane merge, new licence classification or global inventory.

## Bounded review clarification

Deployment entry points snapshot platformArch and installer before expectedVersion
normalization and any awaited existence check. PTY also snapshots onlyIfMissing at
that point. All later install paths and metadata use those admitted values. The
private version comparison normalizes remote.version then expectedVersion again,
even though the caller already normalized its expected input. The SHA identity
checker reads componentId for the metadata read first, then reads current options
for comparisons/reasons after the await; do not snapshot those fields early.

Static review identified an initial candidate that re-read deployment options
after the existence await. The fresh author corrected it from this behavioral
clarification. One injected synthetic check is authorized for this concrete
transaction-input issue: mutate installer/platform while existence is pending,
then assert the admitted installer, source path and metadata remain paired. No
actual cache, network, installer, backend or shell port is loaded by this check.
