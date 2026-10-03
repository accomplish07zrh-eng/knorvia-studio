# Runtime tool and agent wrapper ownership

Baseline packet: 57e5bfe4d833791f233a05fc5af139327860d86d. Source-exposed
curator owns this behavior/API packet; author must not inspect inherited source.
Scope: runtimeToolDeploy.ts, agentBundleWrapper.ts, agentWrapperDeploy.ts only.
Output complete replacement files under /tmp/knorvia-runtime-wrappers-authored.
No package build, runtime tests, deployment, shell/process/network execution,
credentials or protected cache/CDN/network edits. Validation is scoped static.

## Author inputs and imports

Read only this packet, root AGENTS.md and the architecture-governance SKILL.md;
do not discover other guidance, implementations, tests, histories, dependency
source or prior author output. Bounded curator clarifications are available.
Use existing public ports and module aliases. @knorvia/shared exports
getRemoteRuntimeToolsForPlatform(platform) and type RemoteResourcePackageId.
That function returns iterable {toolId, runtime, version:string} entries; runtime
has bundledResourceDir:string and resolveEntrySegments(platform):string[].
@knorvia/server/remote/backend.js exports IRemoteBackend and RemoteEnvironment
(platform:string, arch:string). Backend readFile(path):Promise<string>,
exists(path):Promise<boolean>, exec(command):Promise<StdioStream>,
upload(local,remote):Promise<void>. deployShared.js exports REMOTE_BASE
(~/.knorvia-studio/server), DeployLoggers {log,logWarn (...unknown[]):void},
RemoteAssetDeployOptions, waitForClose(stream):Promise<void>, and
buildRemoteExecutableReplaceCommand(source,target):string (chmod source then
forced move, preserve this existing permission-policy helper). Installer type
RemoteAssetInstaller from remoteAssetInstaller.js has mode and installFile.
posixShell.js exports buildWriteLiteralFileCommand(path,content):string.
Node standard APIs needed: fs/promises writeFile,rm; os tmpdir; path join.

## Ownership and ordering

Runtime tool deployment owns only sequential per-tool admission/materialization
and version-marker writes; installer owns resource materialization, shared close
helper owns remote-command completion. Agent wrapper builder owns pure byte
content, deploy wrapper owns exactly one temp write/upload/replace lifecycle.
No new state or alternate cleanup/permission policies, no changes to production
paths. No replay/cache/stale policy is introduced. This is bootstrap deployment,
not desktop/mobile transport. Existing lifecycle controls stay with callers.

```mermaid
sequenceDiagram
  participant C as Caller
  participant T as Tool owner
  participant I as Installer
  participant B as Backend
  C->>T: platform/options/loggers
  loop ordered platform tools
    T->>B: read .version
    opt equal version
      T->>B: exists binary
    end
    opt admitted install
      T->>I: installFile executable=true
      T->>B: write version; wait close
    end
  end
```

## Runtime tool API and exact behavior

Export interface DeployRuntimeToolOptions extends RemoteAssetDeployOptions:
platformArch:string; installer:RemoteAssetInstaller;
selectedResourcePackageIds?:RemoteResourcePackageId[]. Export async
deployRuntimeTools(backend:IRemoteBackend,env:RemoteEnvironment,
options:DeployRuntimeToolOptions,loggers:DeployLoggers):Promise<void>.

At entry snapshot options.platformArch only. Iterate platform helper result in
order using initial env.platform for helper call; entry resolution reads current
env.platform for each tool. componentId = runtime.bundledResourceDir cast to
resource ID. For each tool, read options.selectedResourcePackageIds live:
if present (including empty array) and component absent, log
`[tool-deploy] ${toolId}: 未选择资源包 ${componentId}，跳过检查和部署`, skip.
Resolve runtime.resolveEntrySegments(env.platform); binaryName = LAST segment
only; falsy last segment -> warn
`[tool-deploy] ${toolId}: 无法解析 binary 名称，跳过部署`, skip.

remoteToolDir = REMOTE_BASE + /tools/ + runtime.bundledResourceDir;
versionFile = remoteToolDir + /.version; binaryPath = remoteToolDir + /binaryName.
Try await backend.readFile(versionFile) then trim; catch ANY failure including
trim failure to empty string. Equal remoteVersion === version -> await exists
binary; if true log
`[tool-deploy] ${toolId}: 远程版本 ${version} 已是最新，跳过`, skip.
If equal but missing, warn exactly
`[remote-assets] ${action}: component=${runtime.bundledResourceDir} reason=remote binary missing path=${remoteBinaryPath}`
where action uses CURRENT options.installer.mode === 'remote-download' ?
'download required' : 'upload required'. No warning when versions differ.

Log `[tool-deploy] ${toolId}: 开始部署 ${version}`; await CURRENT
options.installer.installFile({componentId, sourceRelativePath:
`tools/${snapshottedPlatformArch}/${runtime.bundledResourceDir}/${binaryName}`,
remotePath:binaryPath, executable:true}). No forceRefresh or extra fields.
Then await backend.exec(buildWriteLiteralFileCommand(versionFile,version)),
await waitForClose; log `[tool-deploy] ${toolId}: 部署完成 ${version}`.
Version content has NO appended newline. Stop on any unhandled error preserving
identity; do not write marker before successful install, parallelize tools or
add marker cleanup. Do not snapshot installer/resource selection early.

## Pure agent wrapper contract

Export REMOTE_AGENT_BUNDLE_NAME = 'knorvia.cjs'. Export
buildRemoteAgentBundleWrapper(runtimeResourceDir:string):string. Return EXACT
five lines joined with LF, including final empty line (one trailing LF):

```sh
#!/bin/sh
set -eu
runtime_root="${KNORVIA_SERVER_RUNTIME_ROOT:-$HOME/.knorvia-studio/server}"
exec "$runtime_root/node" "$HOME/.knorvia-studio/server/agents/<runtimeResourceDir>/knorvia.cjs" "$@"
```

Substitute runtimeResourceDir literally with no sanitization/escaping changes;
runtime override applies to node only, bundle still uses fixed HOME path.
Export isRemoteAgentBundleWrapperCurrent(content:string,
runtimeResourceDir:string):boolean. Replace every CRLF with LF only, compare
exactly to generated wrapper; do not trim, accept lone CR or normalize other
whitespace. No process/env reads in builder.

## Wrapper deployment contract

Export isWslBackend(backend:IRemoteBackend):boolean. True iff backend.kind ===
literal 'wsl'; no instanceof or platform inference. Export async
deployRemoteAgentWrapper(params:{backend:IRemoteBackend;content:string;
remoteWrapperPath:string}):Promise<void>.

Snapshot remoteWrapperTempPath = params.remoteWrapperPath + '.new' first. Do
not change fixed staging name to owner UUID as this is existing compatibility.
Check CURRENT params.backend via isWslBackend. WSL branch localTempPath =
join(tmpdir(),`agent-wrapper-${process.pid}-${Date.now()}.sh`). Inside try:
await writeFile(localTempPath, CURRENT params.content, 'utf8'); await CURRENT
params.backend.upload(localTempPath, snapshottedRemoteTemp); await CURRENT
params.backend.exec(buildRemoteExecutableReplaceCommand(remoteTemp,
CURRENT params.remoteWrapperPath)); await waitForClose. Finally await
rm(localTempPath,{force:true}); cleanup rejection can replace previous error.
Local path creation is BEFORE try; no remote-staging cleanup, signal forwarding
or chmod policy changes. WSL bytes upload avoids shell premature expansion.

Non-WSL: exec two helper outputs joined ' && ': literal write(remoteTemp,
CURRENT params.content), executable replace(remoteTemp,CURRENT remoteWrapperPath).
Use CURRENT params.backend as method receiver; wait close. No local filesystem
write/cleanup in this branch. Preserve order, errors and mutable-param reads.

## Validation / evidence

No ordinary test/build; no native/platform/process/network calls. At most one
minimal injected safety check for an observed candidate write/permission risk.
Record source-exposed curator and fresh-author limits and exact hashes; no
novelty, licence/provenance classification or main merge. Deferred: complete
runtime ordering, error/cleanup matrix, platform behavior and semantic types.
