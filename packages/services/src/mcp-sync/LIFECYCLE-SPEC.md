# MCP sync lifecycle — behavior/API authoring contract

2026-10-02, following `ed7a8c933b754210cfdf1e6e93aac8a12f4085cc` in PR 10. Replace the complete `mcpSyncService.ts` owner from this behavior brief, allowing cohesive new internal files below 400 lines. Keep `mcpSync.ts`, shared types and external permission/runtime adapters unchanged. This is a functional-authoring candidate; coordinator source exposure and retained dependencies require separate provenance review.

## Ownership and sequencing

```text
load/list → preferred directory → JSON read → legacy flag fold → best-effort migration write
save → chosen directory → server map edit → preserve other fields → private temp write → rename
import → initial destination snapshot → effective-name conflicts → ordered item rewrite/reserve
                                               → one final destination write if changed
runtime statuses → injected agent callback; write-access → retained permission adapter
```

No observer, cross-call queue, cancellation or server installation API is added. Directory methods only edit config; runtime checks execute solely through the injected callback. Import processes items serially and writes once, using its initial destination snapshot. Legacy migration may write while collecting effective records; do not add a reread or otherwise alter that existing ordering. No network, credentials, actual user config or MCP process starts in this batch.

## Public API and dependencies

Sole factory `createMcpSyncService(dependencies: {listMcpServerStatuses?: IMcpSyncService['listWorkspaceMcpServerStatuses']} = {}):IMcpSyncService`. See unchanged `mcpSync.ts` and shared type-only `mcp-sync.ts`, `settings-source.ts`, declaration portion of `mcp.ts`. McpServerConfig has optional string type/command, string[] args, enabled/enable via arbitrary `[key:string]:any`, other fields retained.

Use `getKnorviaDataRootDir():string` from `../paths.js`; `checkRemoteSyncDirectoryWriteAccess(directory:string):Promise<RemoteSyncWriteAccessResult>` from `../remote-sync/remoteSyncWriteAccess.js`. Retain current permission adapter rather than reimplement it. All public methods async, forwarding original rejection objects for callback/permission/write operations unless the established JSON read wrapper or per-item import result transforms them.

Runtime method checks the live dependencies object's callback each invocation (do not destructure/cache callback); missing callback rejects Error(`MCP server status listing is unavailable in this runtime`); otherwise call dependencies.listMcpServerStatuses(params) with the original params and return its result unchanged. No substitute status check.

## Directory formats, source priority and locations

Home: trimmed HOME || trimmed USERPROFILE || OS homedir. Two descriptors ordered Knorvia then agents:

| Source/directory source | User file                                   | Workspace file                            | Map key     |
| ----------------------- | ------------------------------------------- | ----------------------------------------- | ----------- |
| knorvia                 | `<getKnorviaDataRootDir()>/cli/config.json` | `<workspace>/.knorvia-studio/config.json` | mcp.servers |
| agents                  | `<home>/.agents/mcp.json`                   | `<workspace>/.agents/mcp.json`            | mcpServers  |

For any non-user scope, require workspace path, otherwise error `Missing workspace path for ${directorySource} workspace MCP config`. Directory location is `{source:directorySource,scope:'project' for workspace else 'user',directoryPath:dirname(filePath), ...(workspacePath truthy ? {projectPath:workspacePath}:{})}`. Its file path is resolved when location is built, after awaiting map reads/migration. Source lookup by location.source supports only knorvia/agents; other source rejects `Unsupported MCP settings directory source: ${source}`.

Source priority is whole-map fallback, never a combined merge: read Knorvia map, if any entries use only it; otherwise read agents. Disabled entries still count. Missing files short-circuit before constructing a location. Directory load does workspace preferred sources first when request.workspacePath truthy, then user preferred sources with request.workspacePath read again after the workspace await for location metadata. Each server record preserves Object.entries map order and fields `{source:'knorviaagentmcp',scope,name,config,enabled,projectPath:workspace?workspacePath:undefined,location,file:{format:'json',filePath}}`; include projectPath property even when undefined. Map values are not filtered; preserve established failures for malformed values rather than silently dropping them.

Preferred user records sort by name.localeCompare before candidate construction and before effective-name collision mapping. Record fields name,config,enabled,source descriptor.source,path. Candidate adds id=SHA256 UTF-8 `${source}:${path}:${name}` (lowercase hex), clones config with JSON.parse(JSON.stringify(config)), preserves name/source/path/enabled. JSON clone errors propagate here. Candidate list captures localHomeDir BEFORE records read. Export freshly discovers candidates, then captures localHomeDir before mapping requested IDs; unknown candidate ID error `mcp sync candidate not found: ${id}`; requested IDs preserve order/duplicates, config is deep JSON-cloned again. No archive or byte limit is involved.

Remote statuses capture remoteHomeDir before effective-record read; build first-wins Map(normalized name→record), normalization name.trim().toLowerCase(). Return requested names unchanged/order unchanged with exists and path only when match. Names are not otherwise validated. Write-access checks dirname of live Knorvia user config path and forwards retained adapter result unchanged.

## JSON IO, map representation and migration

JSON read: readFile UTF-8. ENOENT is missing only when error instanceof Error and has property code equal ENOENT; return null. Other read failures wrap Error(`无法读取 MCP 配置文件 ${filePath}: ${message}`), message=Error.message else String(error). Parse failure wraps Error(`无法解析 MCP 配置文件 ${filePath}: ${message}`). Nonrecord (null/array/scalar) rejects `MCP 配置文件 ${filePath} 必须是 JSON 对象`. Never overwrite malformed/unreadable config as empty.

Read map: for mcp.servers, require record parsed.mcp then record .servers; for mcpServers require record parsed.mcpServers; otherwise `{}`. Return the actual map object, retaining raw values and ordinary prototype lookup behavior. Write map: spread current top-level; mcp.servers spreads record current.mcp or `{}`, replaces servers; agents replaces mcpServers. Preserve insertion order and unrelated fields.

Enabled means config.enabled !== false. Setting enabled removes both legacy enable and enabled via destructuring; if enabled truthy return remaining fields, if false add enabled:false. Legacy migration iterates map entries: nonrecord or no `enable in config` keeps entry unchanged; otherwise changed=true, disabled iff enable===false OR enabled===false, canonicalize through setting enabled. Other nonboolean legacy values are removed; enabled-only entries are untouched. Migrated map is an ordinary object; legacy own `__proto__` entry is not enumerated afterward (preserve omission without new prototype mutation policy). If changed, best-effort write merged full config two-space JSON+newline; catch all write errors, console.warn(`[mcp-sync] legacy enable migration failed:`,filePath,message), return in-memory canonicalized map anyway. No changed flags => no disk write. Do not consolidate migration with unrelated later writes.

Atomic writer: mkdir dirname recursive, choose temp in same dir `<basename>.<process.pid>.<Date.now()>.<Math.random hex fragment>.tmp`; write UTF-8 content with mode0600, rename over destination. On write/rename catch await rm(temp,{force:true}) then throw original error; rm failure may replace it. mkdir errors occur outside cleanup try and propagate directly. No locking, retries, chmod of existing files or alternate atomic helper.

## Save and legacy enabled override cleanup

`saveMcpToUserDirectory`:

- action set-enabled: require boolean payload.enabled else `Missing enabled value for MCP set-enabled action`. Scope workspace iff payload.projectPath truthy else user. Location=payload.location ?? default Knorvia location(scope,payload.projectPath). Find supported descriptor; write enabled in selected location, THEN independently clean user CLI legacy override using location/name, even when no target server was found. No rollback if second cleanup fails.
- Other actions: read only Knorvia directory servers at derived scope (may migrate legacy flags); build map via Object.fromEntries of server records name/config. Upsert requires truthy payload.config else `Missing MCP config for upsert action`; assign under exact payload.name. Any non-upsert other action deletes exact payload.name. Ignore source/location for these actions. Write Knorvia file with preserved current fields reread immediately before write.

Enabled writer scope derives from location.scope==='project' else user; workspacePath=location.projectPath only for workspace. Resolve file from descriptor/scope/projectPath (location.directoryPath is cleanup key, not file selection); read current or `{}`, raw map without migration. Read currentServer by exact key and require record; otherwise return without write. Replace map entry with canonical enabled state, preserving all other entries; merge into full file; remove legacy override from this same full config; write JSON+newline privately.

Legacy override removal: if config.mcp and config.mcp[location.directoryPath] are not records, unchanged. Copy both; if `name in copiedPathConfig` absent unchanged. Delete exact name; if remaining Object.keys nonempty retain copiedPathConfig else delete directory key. Return copied config with updated mcp and changed:true. User cleanup separately reads live Knorvia user config or `{}`, calls this helper and writes only when changed. It resolves user config again for that cleanup write as baseline, unlike the single file enabled writer's captured path.

## Import conflict, mutation and failure behavior

Truthy overwrite rejects `mcp sync overwrite is not supported` before any IO. Capture Knorvia target path, read current or `{}`, get raw targetServers reference, THEN collect effective-name map (which may perform legacy migration writes). For each params.servers in input order:

1. Normalize server.name outside per-item try. If targetServers[exact name] is truthy (ordinary property lookup, including inherited keys), skip with target path before normalized-name collision. Otherwise existingByName collision skips with that record's path. A falsy map value can be replaced.
2. Inside try JSON-clone config, canonicalize enabled using exported server.enabled, apply filesystem path rewrite below. Assign exact key into targetServers, reserve normalized name in existingByName with new Knorvia record, emit synced/path and changed=true. A duplicate later name is skipped. Failed clone/rewrite produces failed/path/error message, does not reserve or change flag. Item failures do not reject whole call.
3. If changed, write one full merged config based on INITIAL current snapshot and target map (no reread), JSON+newline/private temp. Final write errors reject whole call even though provisional results were collected. No write when all skipped/failed. Return `{results}` only after write succeeds.

Do not add observers, persistence queue, enabled override map or MCP runtime calls. Preserve saved exported source/path fields only for discovery/export; imports target Knorvia user file regardless of input source.

## Filesystem MCP argument rewriting

Only stdio filesystem servers rewrite args. Stdio: trimmed lowercased string type==='stdio', or type empty/nonstring AND nonempty string command; other types unchanged. Filesystem: name.trim().lower is filesystem/file-system/fs OR joined string command/array-args contains lowercased `@modelcontextprotocol/server-filesystem` or `mcp-server-filesystem`. Ignore nonstring elements for this detection only. No args array => unchanged. When rewriting array, each arg uses string path operations; malformed nonstring args may throw and fail that import item.

For each arg: compute relative containment to localWorkspacePath; if contained and remoteWorkspacePath?.trim() truthy, join remoteWorkspacePath; else compute containment to localHomeDir and join current remoteHomeDir (resolved separately per imported server) if contained; else unchanged. Workspace takes precedence over home. Do not rewrite command/env/URLs or other args.

Comparable path: require nonempty trimmed base; raw candidate trims too. Recognize Windows drive prefix /^[A-Za-z]:[\\/]/ or starts two backslashes, or POSIX leading slash. Unrecognized relative paths return null. Replace all backslashes with '/', remove trailing slashes, empty resulting path becomes '/'. Windows base makes comparison case-insensitive; candidate's own case flag is not independently applied. Equal path => relative ''. Otherwise use base with '/' suffix; candidate must start that prefix; return suffix from original-case normalized candidate. Do not resolve dots, expand tilde, or use OS-specific absolute-path checks.

Remote join: empty relative returns ORIGINAL remote base verbatim, including whitespace. Else split relative on either slash/backslash+, remove empty parts. Trim remote base; leading '/' uses posix.join after replacing backslashes; Windows drive/UNC base uses win32.join; other base uses posix.join after replacing backslashes. Select path style from remote base, not process.platform. Preserve failure messages/identity for unexpected runtime values inside import's item catch.

## Minimal acceptance and provenance

One synthetic config-integrity check is warranted for atomic writing, legacy enable migration, source preference, enabled cleanup, import conflict and path rewriting, private file mode and malformed-config refusal. Run only this bounded check before/after replacement, scoped types/lint/architecture. No MCP servers installed/started, no credentials, real settings, remote permissions or production paths accessed. Forwarding callback tests if useful must be synthetic. Broad test/build/platform/failure-injection and aggregate licensing audits remain deferred. Fresh author receives no inherited bodies/history; coordinator exposure is explicit; no blanket MIT classification or global provenance changes.
