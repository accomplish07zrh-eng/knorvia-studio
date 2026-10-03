# Remote installation/materialization owners

Baseline 57e5bfe4d833791f233a05fc5af139327860d86d. This functional/API packet
is compiled by a source-exposed curator; it is not inherited TypeScript author
input. Complete owners: remoteAssetInstaller.ts, remoteAssetPreflight.ts and
serverBundleDeployCheck.ts. Author writes whole files only into
/tmp/knorvia-install-materialization-authored. Read only this packet, root
AGENTS.md and architecture-governance SKILL.md. No inherited source, tests,
history/patches, other author output, dependency source, guidance discovery,
runtime tests/builds, native/shell/network/remote operations or credentials.

## One owner and existing ports

LocalUploadAssetInstaller owns local resource resolution and its unique remote
staging lifecycle; RemoteDownloadAssetInstaller owns one pinned manifest and
component normal/force Promise maps; module manifest-flight map owns concurrent
fetch sharing and release. Preflight owns stdout drain accumulation; marker
checker owns diagnostic accumulation. Cache/CDN/network implementations remain
outside scope; use their public ports. No ownership split, new policy, security
changes or shared cache helper edits. Existing callers own install-root lock;
component directories use existing material identity, not app-wide deploy state.
This is bootstrap ownership; no desktop/mobile transport replay is introduced.

```mermaid
sequenceDiagram
  participant C as Caller
  participant I as Installer owner
  participant M as Pinned manifest port
  participant B as Backend
  C->>I: install(component, mount, force)
  I->>M: pinned identity / local release
  I->>B: probe ready / prepare unique staging
  I->>B: transfer/check/extract
  I->>B: replace target; await close
  Note over I,B: cancellation gates before remote writes; owned cleanup only
```

Use @knorvia/shared RemoteAssetInstallMode ('local-download-upload'|'remote-download').
backend.js: IRemoteBackend exec(command):Promise<StdioStream>, upload(local,remote,
options?:{signal?:AbortSignal}):Promise<void>, exists(path):Promise<boolean>.
StdioStream stdout/stderr support .on(event, callback) with data Buffer|string;
onClose(callback:(code:number|null)=>void) registers/replays close. Preserve
callbacks/ordering; don't dispose stream/backend or add catch swallowing.

deployShared.js exports REMOTE_BASE ('~/.knorvia-studio/server'), fileExists
(...pathParts:string[]):Promise<boolean>, waitForClose(stream):Promise<void>,
buildRemoteExecutableReplaceCommand(source,target):string,
buildRemoteMoveCommand(source,target):string,
createRemoteAssetPlaceholderError(platform,options,label):Error,
DeployLoggers {log,logWarn (...unknown[]):void}. RemoteAssetDeployOptions fields:
signal?:AbortSignal; releaseDir?:string|null;
resolveReleaseDir?:(componentIds?:string[],options?:{forceRefresh?:boolean})=>Promise<string|null>;
resolveComponentSha256?:(id:string)=>Promise<string|null>;
remoteCdnBaseUrl?:string; remoteCdnBaseUrls?:string[]; remoteCacheDir?:string;
manifestRequestTimeoutMs?:number; remoteAssetNetwork?:RemoteAssetNetworkPort.
All helper-generated permission and literal quoting semantics must remain;
don't chmod a target before staging is ready or invent new fallback policy.

posixShell.js exports quotePosixPathArg(path), quotePosixShellArg(value) and
buildWriteLiteralFileCommand; do not implement own quoting. Path quoting preserves
leading '~/' home expansion safely; shell quoting is fully literal.
localTarGz.js: createTarGzArchive(archivePath:string,
entries:readonly {sourcePath:string;archivePath:string}[]):Promise<void>.
remoteAssetNetwork.js: type RemoteAssetNetworkPort {fetch:typeof globalThis.fetch};
resolveRemoteAssetFetch(network:RemoteAssetNetworkPort|undefined):typeof globalThis.fetch.
remoteAssetCdn.js public functions: resolveRemoteCdnBaseUrls({remoteCdnBaseUrl?,
remoteCdnBaseUrls?}):string[]; buildReleaseBaseCandidates(bases:string[],version:string):string[];
buildReleaseAssetUrlCandidates(releaseBases:string[],fileCandidates:string[]):string[];
buildComponentArtifactUrlCandidates(releaseBases:string[],artifactPath:string,version:string):string[].
Call these ports; no copied implementation or protected-helper edits.

remoteAssetCache.js public API: RemoteAssetManifest {schemaVersion:number,
appVersion:string,platformArch:string,components:RemoteAssetManifestComponent[]};
component {id:string,version:string,sha256:string,artifactPath:string,mount:string};
RemoteAssetManifestRef {manifest:RemoteAssetManifest,
releaseBaseCandidatesForComponents:string[]}.
selectRemoteAssetManifestComponents(manifest, ids?:string[]):component[];
resolveRemoteAssetComponentCacheVersion(version:string):string;
usesRemoteAssetContentAddressedCacheIdentity(id:string):boolean;
buildRemoteAssetManifestFileCandidates(platform:string):string[];
createRemoteAssetManifestRequestSignal(timeoutMs?:number):AbortSignal;
parseRemoteAssetManifestFromResponse(response:Response,url:string,expectedApp:string,
expectedPlatform:string):Promise<RemoteAssetManifest>;
ensureRemoteReleaseDirFromCdn(options:{remoteCdnBaseUrl?,remoteCdnBaseUrls?,
remoteCacheDir?:string,version:string,platformArch:string,componentIds?:string[],
requiredReleasePaths?:readonly string[],manifestRequestTimeoutMs?:number,
remoteAssetNetwork?:RemoteAssetNetworkPort,forceRefresh?:boolean},loggers):Promise<string>.

## Exported installer interfaces

RemoteAssetInstaller: readonly mode:RemoteAssetInstallMode;
optional resolveComponentVersion(id:string):Promise<string|null>;
optional resolveComponentSha256(id:string):Promise<string|null>;
installFile({componentId:string,sourceRelativePath:string,remotePath:string,
executable?:boolean,forceRefresh?:boolean}):Promise<void>;
installDirectory({componentId:string,sourceRelativePath:string,remoteDir:string,
requiredRelativePaths?:string[],forceRefresh?:boolean}):Promise<void>.
Export classes LocalUploadAssetInstaller and RemoteDownloadAssetInstaller.
Export type RemoteManifestRef = RemoteAssetManifestRef.
RemoteDownloadAssetInstallerOptions = RemoteAssetDeployOptions & {
version:string;platformArch:string;remoteCdnBaseUrl?:string;remoteCdnBaseUrls?:string[];
remoteAssetNetwork?:RemoteAssetNetworkPort}.
Export fetchRemoteDownloadManifest(options:RemoteDownloadAssetInstallerOptions,
loggers:DeployLoggers):Promise<RemoteManifestRef>.

## Cancellation and stale staging policy

At each specified gate inspect current options.signal. If not aborted, continue.
If aborted and reason instanceof Error, throw THAT original Error; otherwise
new Error('Remote asset installation canceled'), name='AbortError'. Do not
combine signals or cancel shared local cache work. No stale-backend cleanup
after abort. Preserve gates and their relative placement.

Stale staging janitor is emitted only when options.signal is truthy for local
file/directory preparation. Parent safely path-quoted. Each pattern's trailing
'_' is removed if present, remaining prefix shell-quoted, then literal wildcard
appended. Iterate parent/prefix_ expressions; skip nonexistent candidates;
`find "$candidate" -prune -mtime +0 -exec rm -rf {} + 2>/dev/null || true`.
Four LF-separated statement groups: 'for candidate in <space-separated candidates>; do',
'test -e "$candidate" || continue', find statement above, 'done'. Reclaim only
older-than-24-hour owner staging; never remove active/current/global locations.

## LocalUploadAssetInstaller complete behavior

Constructor(backend,options:RemoteAssetDeployOptions & {platformArch?:string;
version?:string},loggers), retains references, mode literal 'local-download-upload'.
resolveComponentVersion: await private component lookup, return ?.version ?? null.
resolveComponentSha256: first await current options.resolveComponentSha256?.(id);
truthy return directly; otherwise private lookup ?.sha256 ?? null.
Private manifest lookup: snapshot platformArch=options.platformArch?.trim(); then
releaseDir=options.releaseDir?.trim() ?? (await options.resolveReleaseDir?.([id]))?.trim().
Empty string DOES NOT fall through nullish choice. Falsy platform/release -> null.
Try JSON.parse(readFileSync(join(releaseDir,`manifest-${platformArch}.json`),'utf8')),
select first requested component ?? null; all read/parse/select failures -> null.
Do not add validations/normalization or cache local manifest.

Public tryResolveLocalPath(ids:string[],source:string,required?:string[],force=false)
:Promise<string|null>. Choose raw options.releaseDir ?? await optional resolver
(ids,{forceRefresh:force}) ?? null; no trimming. Falsy -> immediate null (no CDN).
join releaseDir/source, await fileExists. If exists, sequentially test each
required release-relative path with fileExists(join(releaseDir,path)); accumulate
absolute missing paths in order. Empty missing -> local source return. Otherwise
warn `[remote-assets] local release asset incomplete: source=${localPath} missing=${missing.join(',')}; trying CDN cache fallback`.
Then private CDN fallback(ids,required,force); falsy -> null. Test returned
joined source exists; false -> null. Required-path pass similarly; if missing,
warn `[remote-assets] CDN release asset incomplete: source=${cdnLocalPath} missing=${missing.join(',')}`,
return null. Otherwise return CDN source. Existence and resolver failures outside
fallback catch propagate; don't eagerly resolve CDN or suppress required errors.

Public resolveLocalPath same args/default, returns string. Await tryResolve;
truthy return. If none, resolve raw releaseDir AGAIN by same nullish expression.
Falsy -> throw createRemoteAssetPlaceholderError(options.platformArch??'<unknown>',
CURRENT options, ids.join(',')); truthy -> new Error
`[deploy] local remote asset not found: ${join(releaseDir,source)} (component=${ids.join(',')})`.
Second resolver call is intentional. Caller required path data is not normalized
here; preserve direct API shape.

Private CDN fallback snapshot platformArch trimmed THEN version trimmed; falsy
platform/version or raw options.remoteCacheDir -> null. CDN enabled if single
trim truthy OR options array.some(url=>url.trim().length>0)??false. Otherwise null.
Try ensureRemoteReleaseDirFromCdn with current raw CDN/cache fields, snapshotted
version/platform, ids, requiredReleasePaths, timeout/network,forceRefresh; loggers.
Catch warn `[remote-assets] local upload CDN fallback failed for ${ids.join(',')}: ${String(error)}`;
force=true rethrow original; otherwise null. Option trimming failures are outside
catch, forced failure may not silently use old material.

Local installFile gates: abort; await resolveLocalPath([params.componentId],
params.sourceRelativePath,undefined,Boolean(params.forceRefresh)); abort AGAIN;
then staging=`${CURRENT params.remotePath}.new-${Date.now()}-${randomUUID()}`.
Log `[remote-assets] uploading ${params.sourceRelativePath} to ${params.remotePath}`;
parent=posix.dirname(current remotePath). Inside try: optional stale janitor
pattern posix.basename(current remotePath)+'.new-\*', then mkdir parent LF-separated;
exec/wait; upload(local,staging,{signal:CURRENT options.signal}); abort; exec
current params.executable ? existing executable-replace helper(staging,current
remotePath) : move helper; wait. Catch if CURRENT signal not aborted, attempt
exec `rm -f <pathquoted own staging>` and wait; cleanup failures warn
`[remote-assets] failed to clean owned file staging ${staging}: ${String(error)}`;
then rethrow original (unless logger throws). No cleanup after success, no
finally cleanup, no signal to exec, no extra gate between prepare/upload.

Local installDirectory: abort; await resolveLocalPath([id],source,
requiredReleasePaths,Boolean(force)). Required release paths: strip only leading
and trailing '/' from source; if empty [] (ignore requirements); otherwise
[source,...requirements stripped leading/trailing '/' and nonempty, each
posix.join(source,required)]. Sequential missing test helper above.
Create localTarPath join(tmpdir(),`knorvia-remote-${CURRENT id}-${Date.now()}-${randomUUID()}.tar.gz`);
await createTarGzArchive(localTar,[{sourcePath:localPath,archivePath:basename(localPath)}]).
This archive creation is BEFORE remote try/finally (failure does not unlink).
Owner suffix Date.now()+'-'+randomUUID() evaluated AFTER archive. Snapshot
remoteTarPath=current remoteDir+'.tar.gz-'+suffix; remoteExtractDir=current
remoteDir+'.extract-'+suffix; extractedSource=extract+'/'+basename(localPath).
Inside try abort again; log uploading source to current remoteDir; compute parent
and basename current remoteDir; optional janitor for basename+'.tar.gz-_' and
basename+'.extract-_', mkdir parent; exec/wait; upload(localTar,remoteTar,{signal:
current options.signal}); abort; execute below LF-separated command and wait.
All variable paths use path-quote helper, move via existing move helper:

1. set -eu
2. cleanup_staging() { rm -f <tar>; rm -rf <extract>; }
3. trap cleanup_staging EXIT HUP INT TERM
4. rm -rf <extract>
5. mkdir -p <extract> <posix.dirname(CURRENT params.remoteDir)>
6. tar -xzf <tar> -C <extract>
7. test -d <extractedSource>
8. rm -rf <CURRENT params.remoteDir>
9. move(extractedSource,CURRENT remoteDir)
10. cleanup_staging
11. trap - EXIT HUP INT TERM

Catch if not currently aborted, exec `rm -f <tar> && rm -rf <extract>`, wait;
cleanup errors warn `[remote-assets] failed to clean owned directory staging ${suffix}: ${String(error)}`;
rethrow original. Finally unlinkSync(localTar) swallowing ALL unlink failures.
Don't add gates before archive or cleanup on abort; no permission-policy change.

## RemoteDownloadAssetInstaller complete behavior

Constructor(backend,options:RemoteDownloadAssetInstallerOptions,tools:RemoteAssetTools,
loggers,manifestPromise?:Promise<RemoteManifestRef>). mode 'remote-download'.
Snapshot manifestPromise supplied ?? fetchRemoteDownloadManifest(options,loggers)
IMMEDIATELY in constructor. Per-instance normal component Promise map and force
task map keyed only component id. No app state or shared component map.
Version/SHA resolution awaits same manifest and selects first ?.field ?? null.

installFile: abort; await ensureComponent(id,[],Boolean(force)); abort; source
path mapping below; staging=current params.remotePath+'.new-'+Date.now()+'-'+UUID.
exec three ' && '-joined operations: mkdir parent(current remotePath), cp -f
source staging, executable-replace(staging,current target) or move helper; wait.
No cleanup catch/trap in this file path and no post-exec abort gate.

installDirectory: abort; await ensureComponent(id,params.requiredRelativePaths,
Boolean(force)); abort; map source; staging=current remoteDir+'.new-'+Date.now()
'-'+UUID. Required checks snapshot current required array map: strip LEADING
slashes only, `test -e <quoted current remoteDir+'/'+relative>` (empty allowed).
exec LF statements: set -eu; cleanup_staging() { rm -rf <staging>; };
trap cleanup_staging EXIT HUP INT TERM; rm -rf staging; mkdir -p staging and
parent current remoteDir; cp -R <source+'/. '> staging (without that illustrative
space: source+'/.'); rm -rf current remoteDir; move staging to current remoteDir;
required checks; cleanup_staging; trap - EXIT HUP INT TERM. Await waitForClose.
No native chmod addition or catch cleanup/backend disposal.

ensureComponent(id,required:readonly string[]=[],force=false): choose existing
force map if force otherwise normal map. Existing -> await and RETURN promise
of required-path assurance with no cache-eviction catch around this path.
No existing: start internal(id,force), set normal map, and force map if force.
Try await task then RETURN required-path assurance (do NOT await this return in
try; asynchronous rejection from assurance escapes catch). Catch initial task
failure deletes each map entry only if still same task, rethrows original.

Required assurance: empty array -> ref. Sequentially backend.exists for
componentDir+'/'+required stripped leading '/' only. If none missing OR ref
fromCache false, return ref (new downloads do not fail missing check here).
Otherwise warn `[remote-assets] remote component cache incomplete: component=${ref.component.id} missing=${missing.join(',')}; redownloading`;
remove ref.componentDir via exec 'rm -rf <quoted>' then wait; internal(ref.id)
without force, overwrite NORMAL map only, return await task. Do not recheck
required paths, clear force map or add catch/eviction; preserve frozen behavior.

Source mapping: component.mount strip trailing '/' ONLY; release-relative source
strip leading/trailing '/'; equal mount => '.'; starts mount+'/' => suffix;
otherwise unchanged normalized source. '.' => componentDir+'/.' else
componentDir+'/'+relative. No traversal/sanitization policy changes.

Internal ensureComponent: await pinned manifest, select first requested;
missing -> new Error `[remote-assets] manifest is missing requested component: ${id}`.
cache segment if existing usesRemoteAssetContentAddressedCacheIdentity(component.id)
then raw component.sha256; otherwise createHash('sha256').update(existing
resolveRemoteAssetComponentCacheVersion(component.version)).digest('hex').slice(0,16).
platform and id safe segment replace every character outside A-Za-z0-9._+-
with '_', NO trim. componentDir=REMOTE_BASE+'/asset-cache/components/'+safe
CURRENT options.platformArch+'/'+safe id+'/'+cache segment. ready=dir+'/.ready'.
Await backend.exists(ready). If true force => warn
`[remote-assets] download required: component=${id} reason=force refresh path=${ready}`;
remove componentDir/wait then continue. True nonforce => log
`[remote-assets] remote component cache hit: ${id}@${version}`, return
{component,componentDir,fromCache:true}. For nonforce no ready, warn
`[remote-assets] download required: component=${id} reason=remote component cache missing path=${ready}`.
Force absent-ready skips missing-cache warning. Artifact URLs use pinned bases,
component.artifactPath, current options.version; HEAD each sequential using
resolveRemoteAssetFetch(current network) selected ONCE, {method:'HEAD'}, no
timeout/signal. Catch all HEAD errors and continue; non-ok continue. Content
length: falsyheader null; Number.parseInt(header,10), finite positive return
(trailingjunk valid), else null. First valid result returned, otherwise null.
Abort gate ONLY after all HEAD progress sizing work and before staging.

Staging=REMOTE_BASE+'/asset-cache/staging/'+safe id+'-'+Date.now()+'-'+UUID;
archive=staging+'/component.tar.gz'; extract=staging+'/extract'; newdir=
componentDir+'.new-'+separately Date.now()+'-'+UUID; lock=componentDir+'.lock'.
Cleanup command EXACT shape: `if [ -n "${lock_heartbeat_pid:-}" ]; then kill "$lock_heartbeat_pid" >/dev/null 2>&1 || true; wait "$lock_heartbeat_pid" 2>/dev/null || true; fi; rm -rf <lock> <staging> <newdir>`.
Build download command using current tools.download, URLs, archive, label id@version,
totalBytes, expectedSha256 component.sha256, current tools.sha256; then checksum
command current sha tool/archive. Emit following statements joined ' && ':

1 set -eu
2 rm -rf staging
3 mkdir -p staging parent(componentDir)
4 while ! mkdir <lock> 2>/dev/null; do if [ -e <ready> ]; then rm -rf <staging>; exit 0; fi; lock_mtime=$({ stat -c %Y <lock> || stat -f %m <lock>; } 2>/dev/null || printf 0); lock_now=$(date +%s); if [ "$lock_mtime" -gt 0 ] && [ $((lock_now - lock_mtime)) -ge 600 ]; then echo <shellquoted '[remote-assets] stale lock for id@version, retrying'> >&2; rm -rf <lock>; continue; fi; sleep 1; done
5 lock_heartbeat_pid=; (while :; do touch <lock> 2>/dev/null || exit 0; sleep 30; done) & lock_heartbeat_pid=$!
6 trap <shellquoted entire cleanup command> EXIT
7 if [ -e <ready> ]; then exit 0; fi
8 download command below
9 actual_sha=$(checksum command)
10 if [ "$actual_sha" != <shellquoted sha> ]; then echo <shellquoted '[remote-assets] sha256 mismatch for id@version'> >&2; exit 1; fi
11 mkdir -p extract
12 tools.tar -xzf archive -C extract
13 test "$(find <extract> -mindepth 1 -maxdepth 1 | head -n 1)"
14 printf ready > <extract+'/.ready'>
15 rm -rf newdir
16 move(extract,newdir)
17 rm -rf componentDir
18 move(newdir,componentDir)
19 cleanup command
20 trap - EXIT

Paths all pathquoted. Log `[remote-assets] remote downloading ${id}@${version}`;
exec command; attach progress listeners before waitForClose; await wait; return
{component,componentDir,fromCache:false}, including when lock/ready branch did
not actually download. No validation change, native command runs in author.

## Manifest fetch / concurrency ownership

Module map key normal resolver result: [CURRENT options.version, current
options.platformArch,String(options.manifestRequestTimeoutMs??'default'),
...resolvedCDNbases].join('::'). Resolve bases using object with only raw single
and array fields. Existing truthy task returned. Otherwise start private fetch
then finally delete key only if still same task; register task and return it.
Export remains async: caller outer Promise identity not guaranteed. Network
port/signal excluded from key intentionally, no changes to cache/force input.

Private fetch computes release base candidates(version), manifest file candidates
(platform), asset candidate URLs in that order. Sequential candidates, each:
log `[remote-assets] downloading manifest ${url}`;
createRemoteAssetManifestRequestSignal(current timeout) OUTSIDE fetch catch;
try resolveRemoteAssetFetch(current network)(url,{signal}); failure add
`${url} -> ${String(error)}`, warn
`[remote-assets] manifest candidate failed ${url}: ${String(error)}`, continue.
Non-ok: if status !==404 add `${url} -> HTTP ${status}`, no warn; continue.
Parse response with URL/current options.version/current platform. Catch parse:
signal not aborted -> rethrow SAME immediately, no candidate fallback/warn;
aborted -> warn failure then push diagnostic, continue. On success derive matching
base: strip trailing slashes on each candidate; nonempty candidate prefix url
candidate+'/', sort descending length stable; first or null. Matching base first
then ORIGINAL candidate entries !== matched normalized base, otherwise original
array. Return manifest+releaseBaseCandidatesForComponents. All errors exhausted:
nonempty diagnostics -> Error
`[remote-assets] failed to fetch manifest for ${current platform}: ${errors.join('; ')}`;
otherwise Error `[remote-assets] manifest not found for ${current platform}`.
No secondary fetch retry, no persistent success cache, no body deadline bypass.

## Pure download and checksum command API

Export buildRemoteChecksumCommand({tool:RemoteSha256Tool,filePath:string}):string.
Pathquote first; sha256sum -> `sha256sum <file> | awk '{print $1}'`;
shasum -> `shasum -a 256 <file> | awk '{print $1}'`;
else openssl -> `openssl dgst -sha256 <file> | awk '{print $NF}'`.
Export buildRemoteArtifactDownloadCommand({tool:RemoteDownloadTool,urls:string[],
outputPath:string,progressLabel:string,totalBytes?:number|null,
expectedSha256?:string,sha256Tool?:RemoteSha256Tool}):string.
Verify only expectedSha typeof string && length>0 && shaTool typeof string.
Per URL in order quote output path then if tool literal curl command
`curl -fL --retry 2 --connect-timeout 20 -o <output> <pathquoted url>`;
all other tool values wget `wget --tries=3 --timeout=20 -O <output> <pathquoted url>`.
No verification -> that plain command. Verification -> ' && '-join rm -f
output; download command; actual_sha=$(checksum); then
`if [ "$actual_sha" = <shellquoted expected> ]; then true; else echo <shellquoted '[remote-assets] sha256 mismatch for label: expected=expected, actual='>"$actual_sha" >&2; false; fi`.
Each attempt wrapped parentheses, joined ' || '; checksum belongs INSIDE each
candidate attempt so mismatch can fallback. Empty URL list emits empty attempts.

Progress wrapper quotes output path and label. Total number finite -> floor,

> 0 accepted else null; other types/null/Infinity/NaN null. Printer known total:
> `awk -v label=<shellquoted label> -v bytes="$progress_size" -v total=<total> -v elapsed="$progress_elapsed" 'BEGIN { transferred = bytes / 1048576; total_mb = total / 1048576; speed = transferred / elapsed; percent = bytes / total * 100; if (percent > 100) percent = 100; printf "download progress: [%s] %.1f%% (%.1f/%.1f MB, %.2f MB/s)\n", label, percent, transferred, total_mb, speed; fflush(); }'`
> Printer unknown omits total option, uses BEGIN transferred/speed and printf
> `download progress: [%s] %.1f MB (total unknown, %.2f MB/s)\n`, arguments
> label,transferred,speed, fflush. Generated awk string contains literal backslash-n.
> Progress variable update:
> `if [ -f <output> ]; then progress_size=$(wc -c < <output> 2>/dev/null || printf 0); else progress_size=0; fi; progress_now=$(date +%s); progress_elapsed=$((progress_now - progress_started_at)); if [ "$progress_elapsed" -le 0 ]; then progress_elapsed=1; fi`.
> Progress loop:
> `progress_started_at=$(date +%s); progress_pid=; (last_progress_size=-1; while :; do <update>; if [ "$progress_size" != "$last_progress_size" ]; then <printer>; last_progress_size="$progress_size"; fi; sleep 1; done) & progress_pid=$!`.
> Stop:
> `if [ -n "$progress_pid" ]; then kill "$progress_pid" >/dev/null 2>&1 || true; wait "$progress_pid" 2>/dev/null || true; fi; if [ -f <output> ]; then <update>; <printer>; fi`.
> Full `set +e; <loop>; <attempts>; download_status=$?; set -e; <stop>; test "$download_status" -eq 0`.
> These are required GENERATED SHELL BYTES, not commands to execute. Do not
> change progress formula, PID wait order, traps, punctuation/quoting or policies.

Progress forwarding: per-stream buffered string; stdout data -> chunk.toString,
append; split /\r?\n/, retain last fragment, iterate completed lines trim and
log if /^download progress:/i. OnClose flush trimmed buffered fragment if match,
no clearing/idempotent guard, no stderr forwarding/end listener. Propagate log
exceptions through callback; preserve unbounded buffer/no disposal.

## Preflight complete owner

Export types RemoteDownloadTool='curl'|'wget';
RemoteSha256Tool='sha256sum'|'shasum'|'openssl';
RemoteAssetTools {download:RemoteDownloadTool;tar:'tar';sha256:RemoteSha256Tool}.
detectRemoteAssetTools(backend,loggers:{log:(...unknown[])=>void}):Promise<RemoteAssetTools>.
Log '[remote-assets] preflight: checking remote download tools'; exec these
'; '-joined command parts exactly:
download=;
if command -v curl >/dev/null 2>&1; then download=curl; elif command -v wget >/dev/null 2>&1; then download=wget; fi;
tar_tool=;
if command -v tar >/dev/null 2>&1; then tar_tool=tar; fi;
sha_tool=;
if command -v sha256sum >/dev/null 2>&1; then sha_tool=sha256sum; elif command -v shasum >/dev/null 2>&1; then sha_tool=shasum; elif command -v openssl >/dev/null 2>&1; then sha_tool=openssl; fi;
printf 'download=%s\ntar=%s\nsha256=%s\n' "$download" "$tar_tool" "$sha_tool"
(No extra trailing semicolon; printf string contains actual LF characters in
generated command.) Start stdout collector immediately after exec; await shared
waitForClose FIRST, then collector. Close failure aborts detection; collector
remains installed/unobserved, do not change listener policy.

Collector resolves accumulated stdout once, never rejects. Setup order stdout
data, end,close,error listeners then stream.onClose. End/close/error settle
immediately; onClose schedules 50ms trailing-drain timer (reset previous).
Data append even after settlement; if timer exists reschedule it. Timer scheduling
does nothing once settled; settling idempotently sets flag, clears timer, resolves
snapshot. No stream disposal, listener removal or timeout unref.

Parse stdout split LF. For each first '=' index>0, use raw untrimmed key before
'=', trimmed value after; assign ordinary {} record; last duplicate wins. Exact
literal valid download/tar/sha; validate failures in download,tar,sha order:
1 '远端服务器缺少 curl 或 wget，无法直接下载 Knorvia Studio 远程资源。请安装 curl/wget，或切回“本地下载后上传”。'
2 '远端服务器缺少 tar，无法解压 Knorvia Studio 远程资源。请安装 tar，或切回“本地下载后上传”。'
3 '远端服务器缺少 sha256sum、shasum 或 openssl，无法校验 Knorvia Studio 远程资源。请安装其中一个校验工具，或切回“本地下载后上传”。'
New Error each; no fallback. Log
`[remote-assets] preflight: selected tools download=${download} tar=${tar} sha256=${sha256}`;
return object in download,tar,sha256 order.

## Bundle marker check complete owner

Export ServerBundleDeployDecision={shouldDeploy:false}|{shouldDeploy:true;reason:string}.
checkServerBundleRequiredMarkers(backend,nodePath:string,serverPath:string):Promise<...>.
Required marker array order: skill-sync, mcp-sync, plugin-sync,
\_\_knorvia_rpc_nested_uint8array_v1, exportMarketplaceSourceArchive,
importMarketplaceSourceArchive. Generated -e script EXACT leading/trailing LF:

```js
const fs = require("fs");
const content = fs.readFileSync(process.argv[1], "utf8");
const missing = [
  "skill-sync",
  "mcp-sync",
  "plugin-sync",
  "__knorvia_rpc_nested_uint8array_v1",
  "exportMarketplaceSourceArchive",
  "importMarketplaceSourceArchive",
].filter((marker) => !content.includes(marker));
if (missing.length > 0) {
  console.error("missing required server bundle markers: " + missing.join(","));
  process.exit(2);
}
```

exec `${pathquote(nodePath)} -e ${shellquote(script)} ${pathquote(serverPath)}`
OUTSIDE catch; backend rejection propagates unchanged. Try await private close:
resolve -> {shouldDeploy:false}. Rejection -> {shouldDeploy:true,reason:
`remote server bundle missing required markers: ${String(error)}`}.
Private close starts stderr listener then onClose. Accumulate chunk.toString
only while prior text.length<2048; a single chunk may overshoot and isn't sliced.
code===0 resolve; all other codes reject new Error(stderr.trim() ||
`remote deploy check exited with code ${code}`). No other listeners, timeout,
cleanup or error decoration; stderr logger errors propagate callback naturally.

## Validation and provenance boundaries

This packet preserves publicly observable material identities, generated shell
byte contracts and error/side-effect order, including frozen oddities. It does
not grant independent authorship/licence classification. Shared filesystem
exclusion is declared, not OS-enforced. No novelty requirement. Curator may
review baseline vs authored output and ask bounded behavior corrections, not
make source substitutions. Only repository formatting after final author output.
Run scoped lint, syntax-only transpile diagnostics and changed architecture;
skip ordinary tests/builds/semantic types. One minimal injected safety check is
allowed only if a concrete candidate write/permission risk is observed. Complete
cache/manifest/download/progress/platform/error suites remain deferred.

## Bounded curator review clarifications

Material identity comes from the selected component.id, which may be canonical
even when the requested id needs normalization. Use selected id for cache paths,
staging and logs; requested id only selects/diagnoses missing component. Safe
segments use Unicode-aware negated-character replacement, one underscore per
non-ASCII code point. Read component fields at original stage boundaries, including
staging after HEAD/abort; don't snapshot component label across awaits.

Each cancellation gate captures current signal once, then checks that signal
and its reason. Local directory call arguments are admitted in order: id, source,
source argument for required-path helper, required array (even empty-normalized
source), force. Required-path helper normalizes source then loops requirements
sequentially, preserving iteration instead of array species-dependent maps.
Per-URL download first quotes output and URL into the plain command. Verified
attempt then computes checksum, quotes output again, expected SHA and mismatch
label before assembly. Progress prefix match uses Unicode-aware case folding.

An initial candidate used requested id/non-Unicode safe replacement for remote
component paths. Source review identified this concrete material write-path risk;
no failing candidate runtime was run or claimed. The author corrected from
bounded behavior clarification. One permitted injected safety check is run on
baseline and final candidate: canonical selected id plus one-code-point platform
replacement determines cached source paths. All package dependencies are virtual
synthetic ports, no actual cache/network/archiver/backend operations; quoted data
is synthetic JSON text, so this test does not validate actual shell quoting.

The private preflight collector remains async and returns the new drain Promise,
preserving existing outer-Promise adoption timing before close-then-stdout awaits.
