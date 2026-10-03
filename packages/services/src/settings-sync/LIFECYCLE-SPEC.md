# Settings sync lifecycle — behavior contract, 2026-10-02

Parent base `f25b931164ee6287167e965e9da7a7586131b264`; this batch follows settings persistence commit `0574142f420dd446d9e0c8bca89e311f172f2a4d` in the same draft PR. Replace the complete `settingsSyncService.ts` owner from behavior, including discovery, collision handling, writes, results and first-run forwarding. Keep `settingsSync.ts` and shared public types unchanged. New implementation may use cohesive internal files inside this directory. This is not a helper extraction or a license decision.

## Lifecycle and compatibility boundaries

```text
detect → explicit manual category → ordered source roots → candidates → collision projection
importSelected → selection order → fresh candidates → selected scope/paths → collision check
                                                               ↓
result/counters ← name-cache update on success ← copy/link then config merge/write
first-run commands → existing settingService → queued setting.json persistence → existing observer
```

Discovery never writes. There is no persistent sync cache. Imports process request selections and each selection's candidates serially. Each selection performs fresh discovery of its whole category before filtering to its agent/scope/selected paths. Caches live only inside discovery/import passes; only successful imports reserve names during import. No new cross-call transaction/queue, atomic JSON format change, rollback, watcher, cancellation API or progress notification is introduced: current `onProgress` is accepted by the public interface but unused. Workspace identity is accepted but path scope is determined by workspacePath. Settings observer behavior and queued persistence are preserved by calling the injected settings service for the marker, not by creating a second settings writer.

## Public behavior

`createSettingsSyncService({settingService})` synchronously returns `ISettingsSyncService` (see `settingsSync.ts`, shared type-only `packages/shared/src/settings-sync.ts`). Only runtime imports from shared dependencies are existing logger, path, command parser and skill walker APIs described below.

- `detect(request)` returns `{agents:[]}` unless `intent === manualImport` and categories includes at least one supported category. If several are included, choose first in fixed priority skills, commands, plugins, mcpServers (not request order). Providers are unsupported.
- `importSelected` loops request selections serially. Providers/unknown categories produce one skipped task (0 imported / 1 skipped / 0 failed), no category result list. Supported categories always include their result array, including empty arrays. Task status: failed if any failure; else success if imported >0; else skipped. Total successCount sums importedCount (not successful tasks), others sum corresponding counts. Results retain candidate order, never sort imports by display name.
- Optional sourceScope filters exact global/project; optional path array filters exact candidate sourcePath. Empty array imports nothing; absent imports all matches. Destination defaults to source scope, optional targetScope overrides; skills/commands capture their default target root during collection after source-path admission and before metadata reads, while explicit overrides and plugin/MCP targets resolve when used; missing project destination yields skipped targetExists (MCP: sameNameExists).
- Imports default to symlink mode only when importMode is undefined; only exact symlink mode links, other runtime values copy. File/mkdir/config write exceptions inside each candidate's mutation produce failed result and continue; source discovery/conflict-check errors not already handled by their readers may propagate. No error wrapping for forwarded setting-service reads/writes or instruction-copy failures.
- `getFirstRunPromptState` reads settings and returns `{handled: settingsSyncFirstRunPromptHandled === true}`. `markFirstRunPromptHandled` awaits injected update with exactly `{settingsSyncFirstRunPromptHandled:true}`. A handled marker records consuming the prompt, independent of import success.

## Source locations and order

Source home is first nonempty trimmed HOME, USERPROFILE, otherwise OS homedir (do not add desktop override). Destination global root comes from `getKnorviaDataRootDir()` in `../paths.js`; project root is `<workspace>/.knorvia-studio`. Global category roots append skills/commands/plugins; global config is `<dataRoot>/cli/config.json`; project config is `<workspace>/.knorvia-studio/config.json`.

For skills, commands and plugins, use the agent order in this table. Project and global column values are base paths to which the category name is appended. Empty project base means directly below workspace. Skills include traeCn; commands/plugins exclude traeCn entirely.

| Agent                | Project base | Global base       |
| -------------------- | ------------ | ----------------- |
| claudeCode           | .claude      | .claude           |
| codexCli             | .codex       | .codex            |
| openCode             | .opencode    | .config/opencode  |
| openClaw             | (empty)      | .openclaw         |
| augment              | .augment     | .augment          |
| continue             | .continue    | .continue         |
| goose                | .goose       | .config/goose     |
| qwenCode             | .qwen        | .qwen             |
| qode                 | .qoder       | .qoder            |
| qodeCn               | .qoder       | .qoder-cn         |
| windsurf             | .windsurf    | .codeium/windsurf |
| trae                 | .trae        | .trae             |
| traeCn (skills only) | .trae        | .trae-cn          |
| kiroCli              | .kiro        | .kiro             |
| roo                  | .roo         | .roo              |
| codeBuddy            | .codebuddy   | .codebuddy        |

Build all global roots in table order first, then all project roots in that same order when workspacePath is truthy. Category source files/dirs discovered in a root are sorted using localeCompare on their paths. A per-category seen-source-path set across all roots gives the first agent/root ownership of duplicates (e.g. project qode before qodeCn). Skills dedupe their SKILL.md path, commands their markdown file path, plugins their directory path. Seen paths are recorded before target/metadata validation.

MCP sources use this separate order; all global files first, then project files. JSON format reads mcpServers unless stated otherwise.

| Agent      | Project files, in order          | Global file                    | Format        |
| ---------- | -------------------------------- | ------------------------------ | ------------- |
| claudeCode | .claude/settings.json; .mcp.json | .claude/settings.json          | JSON          |
| codexCli   | .codex/config.toml               | .codex/config.toml             | TOML          |
| openCode   | .opencode/opencode.json          | .config/opencode/opencode.json | OpenCode JSON |
| openClaw   | settings.json                    | .openclaw/settings.json        | JSON          |
| qwenCode   | .qwen/settings.json              | .qwen/settings.json            | JSON          |
| qode       | .qoder/settings.json             | .qoder/settings.json           | JSON          |
| qodeCn     | .qoder/settings.json             | .qoder-cn/settings.json        | JSON          |
| trae       | .trae/settings.json              | .trae/settings.json            | JSON          |
| kiroCli    | .kiro/settings.json              | .kiro/settings.json            | JSON          |
| roo        | .roo/settings.json               | .roo/settings.json             | JSON          |
| codeBuddy  | .codebuddy/settings.json         | .codebuddy/settings.json       | JSON          |
| agents     | .agents/mcp.json                 | .agents/mcp.json               | JSON          |

MCP preserves Object.entries order inside each source. Candidate sourcePath is `<file>#<raw server name>`; deduplication key includes agent and this sourcePath, so qode/qodeCn may both report the same project file.

## Resource parsing

- Directory availability uses successful `readdir` (all errors mean unavailable); general path availability uses `lstat` (all errors mean absent, dangling links count as present).
- Skills: consume `walkSkillMarkdownPaths(root): AsyncGenerator<string>` from `../skills/skillDiscoveryWalk.js`; dedupe and locale-sort its yielded paths. It owns bounded traversal and symlink rules and is retained unchanged. Candidate sourcePath is dirname(SKILL.md), destination basename of that directory (nested skills flatten). Name fallback is basename(directory). Read UTF-8; normalize CRLF and CR to LF. Frontmatter only if content starts `---` + newline, terminated by newline + `---` followed by newline/end. Parse with yaml.parse. For record frontmatter choose nonempty trimmed string name; string/number version converts to trimmed string. Missing/invalid fields, parse errors or non-record frontmatter use loose top-level lines matching `^name\s*:\s*(.+)$` / version in multiline mode. Loose value trims, removes matching single/double outer quotes then trims; empty name falls back. No frontmatter/read failure gives fallback name and no version.
- Commands: skip every dot-prefixed entry (including dot markdown files), recurse ordinary directories only, ignore symbolic-link entries, collect ordinary files ending .md case-insensitively, locale-sort. Name is `/` + relative path without .md, separators split on slash/backslash and empty pieces removed then joined with `/`. Metadata comes from retained `CommandFileParser.parseCommandFile(content,filePath)` in `../commands/commandFileParser.js`, which may return null and optional description/argumentHint. Truthy metadata is exposed; read/parse failures leave only derived name. Copy preserves nested relative path and extension case.
- Plugins: scan only direct non-dot children that are directories or symlinks. Recognized manifest priority: `.knorvia-plugin/plugin.json`, then `.claude-plugin/plugin.json`, then `.codex-plugin/plugin.json`. First lstat-present manifest wins, even when invalid. Parse record JSON with nonempty trimmed string name; optional nonempty trimmed string version (numbers omitted); invalid/read failure skips candidate. ID is `<trimmed name>@inline`.
- MCP: read JSON record or smol-toml.parse; all read/parse failures yield empty map. JSON uses mcpServers; TOML uses mcp_servers ?? mcpServers; OpenCode uses mcp. Map entries require nonempty trimmed name and record (non-null, non-array object) config, preserving original key spelling and raw fields. Legacy normalized-map enumeration omits `__proto__` as an own server key; preserve that omission explicitly, without prototype mutation. Other keys such as constructor/toString remain own entries. OpenCode array command filters strings, then if first is truthy sets command=first, args=remaining strings; removes old command and type, mapping local→stdio, remote→http, and omitting any other type. Empty/falsy first leaves config unchanged. OpenCode local + nonempty string command changes type to stdio and trims command. Other cases unchanged. Strip only timeout and startup_timeout_sec from every imported external config. No network/auth operations.

## Discovery projection and collisions

Return only agents with candidates, preserving supported agent order. Each has discovered:true and exactly one category summary. Category fields: category, discoveredCount, importableCount, skippedCount (discovered-importable), unique locale-sorted sourcePaths (source-root paths, not candidate paths), sourceRoots, selectedByDefault (skills iff importable>0, all other categories false).

Group sourceRoots by scope + source-root path; each contains scope, path, counts and category-named array (skills/commands/plugins/mcpServers). Arrays sort by name.localeCompare, roots by scope.localeCompare then path.localeCompare. Per-item fields name,path,importable; include skipReason only if skipped; skills/plugins include truthy version; commands include truthy description/argumentHint. Each discovery pass caches existing names but does NOT reserve names for projected candidates: two source candidates with the same name can both project importable. Overall importable totals use a separate conflict pass from sourceRoot summaries, retaining fresh filesystem observation points.

Collision rules (target scope normally source scope):

- Skills: successful readdir(target directory) => targetExists; otherwise existing target-root skill names normalized trim+lowercase => sameNameExists. A regular file at target is not preclassified targetExists (mutation later fails). Existing skill names use retained walker + same metadata parser.
- Commands: lstat target path => targetExists; otherwise existing target-root command names (relative path-derived) trim+lowercase => sameNameExists.
- Plugins: lstat target path => targetExists; missing target config path => targetExists; otherwise configured plugin IDs lowercased => sameNameExists. Read only `plugins.dirs` string entries from config; resolve each path then read metadata; do not inspect arbitrary unregistered plugin directories for same-name checks.
- MCP: existing destination `mcp.servers` valid-map names trim+lowercase => sameNameExists. Missing project config target => sameNameExists.

Caches key by target-root for skills/commands, config file path for plugins, target scope for MCP. Import reserves successful name/ID in that cache; failed copy/config write does not reserve. Existing target paths still affect later iterations. Keep collision precedence and result reasons.

## Import writes and stored formats

- Skills/plugins: ensure parent dir; symlink to absolute resolved source with dir type on non-Windows, junction on Windows. Copy mode uses fs.cp recursive:true, errorOnExist:true, force:false. Do not transform files or manifests.
- Commands: ensure parent; non-Windows symlink uses absolute source and type file. On Windows symlink mode attempts hardlink to resolved source; any hardlink failure logs and falls back to fs.cp. Copy uses errorOnExist:true, force:false (not recursive). Preserve info/warn diagnostics through createServiceLogger; no security changes.
- Plugin success requires filesystem import then config registration. Config registration reads JSON record or `{}` on any invalid/read failure; preserves other top-level fields and record plugins fields. String-only dirs array; if any resolved existing dir equals resolved target, do not write at all. Otherwise append resolved target to filtered string dirs. No rollback if registration fails after filesystem import.
- MCP success rereads config immediately before write. Preserve other top-level fields and record mcp fields; read existing valid-record mcp.servers map, merge candidate under its original name (invalid existing map entries are dropped by this established normalization). No new sanitization or schema validation.
- Both config writes mkdir parent then write UTF-8 JSON.stringify(value,null,2) plus exactly one trailing newline, preserving insertion order. This existing sync format differs from setting.json. No atomic writer or cross-call queue is added in this compatibility replacement.
- Every supported task returns per-item name,path,sourceScope,status; skills/plugins retain truthy version for success/skip/failure. Commands do not include description/argumentHint in import results. Skip has skipReason, success/failure do not. Per-item failure swallows original error without attaching it, as baseline; forwarding methods preserve their rejection objects.

## Claude instructions copy

Source `<source home>/.claude/CLAUDE.md`, target `<dataRoot>/AGENTS.md`. Ignore workspace selection for paths. Status reads source then target using lstat and returns sourcePath,targetPath,sourceExists,targetExists,supported=sourceExists, unavailableReason:missingSource only when absent. Copy request defaults to `{}`: read both presences; absent source skips missingSource (even if target exists); existing target skips targetExists unless overwrite === true; both skipped cases overwritten:false. Otherwise mkdir target parent and copyFile; copied result overwritten equals previous target existence. No catch/wrap of mkdir/copy errors. Log completed result with workspace path/identity and source/target/status/overwritten/skippedReason. No marker update or observer event is synthesized here.

## Evidence and minimal acceptance

Only synthetic HOME/USERPROFILE/data/workspace directories may be used; no real configurations or credentials. One bounded data-integrity check should verify sequential mixed imports preserve unrelated config fields, newline format, conflict winner and repeat-import no-overwrite behavior. Keep exact original baseline and replacement results for this concrete write risk, without broad suites/builds/equivalence matrices. Full integration and cross-platform acceptance remain deferred. Source-exposed coordinator supplies this brief to a fresh no-target-source author; document actual author exposure and all retained dependencies. Do not modify root license, global provenance/inventory, dependency manifests or other lanes.
