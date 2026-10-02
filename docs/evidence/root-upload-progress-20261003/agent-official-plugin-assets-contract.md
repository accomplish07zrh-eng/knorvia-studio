# Body-free contract: official plugin asset declarations and path helpers

Target: `packages/server/src/remote/agentOfficialPluginAssets.ts`.
Binding: current bytes at lane head `f276fb97eaf15974befb814f80fc16d23e6db9f8`, SHA-256 `1153bcf21a3dc19c99d46d28d255ae42106d3967726816efd167739a69203bff`, 3090 bytes. Root must hash its current target bytes without displaying implementation; a mismatch requires a newly bound packet rather than reuse. Root PR12 head is only a reported parallel context, not integrated or inspected here.

## Eligibility and retention

This target is predominantly fixed configuration declarations plus three small pure POSIX path helpers. No lifecycle, IO, writable state, asynchronous work, permission action or substantive deployment implementation exists. Retain config/required expressions and do not claim a complete substantive owner rewrite based on changing names, layout or these tiny helpers. The values below are public compatibility data; forwarding them is not forwarding implementation bodies. A bounded API-only author could author the tiny helpers if root independently finds that necessary, with this limited classification retained.

## Public contract values

All exported arrays retain original ordering, readonly tuple TypeScript inference, and ordinary JavaScript array mutability; there is no Object.freeze or runtime validation.

- `REMOTE_AGENT_OFFICIAL_PLUGIN_DIR_NAME`: string value `packages`.
- `REMOTE_AGENT_OFFICIAL_PLUGIN_PACKAGE_NAMES`: one item `browser-use-plugin`.
- `REMOTE_AGENT_OFFICIAL_PLUGIN_INCLUDED_TOP_LEVEL_PATHS`, in order: `.mcp.json`, `.knorvia-plugin`, `README.md`, `agents`, `commands`, `dist`, `docs`, `hooks`, `output-styles`, `package.json`, `scripts`, `skills`, `templates`.
- `REMOTE_AGENT_OFFICIAL_PLUGIN_REQUIRED_RELATIVE_PATHS`: first the initialization-time projection of PACKAGE_NAMES to each package's `.knorvia-plugin/plugin.json`, then fixed values in order: `browser-use-plugin/docs/api.json`, `browser-use-plugin/docs/documents.json`, `browser-use-plugin/docs/overview.md`, `browser-use-plugin/docs/recording.md`, `browser-use-plugin/docs/workflow.md`, `browser-use-plugin/scripts/browser-client.mjs`, `browser-use-plugin/skills/control-browser/SKILL.md`, `browser-use-plugin/skills/web-gui-tester/SKILL.md`.

The initial projection is a snapshot at module initialization, not a getter that recalculates if PACKAGE_NAMES changes. Required assets describe outputs actually produced by browser-use-plugin; do not add `dist/mcp/server.js` or the node-repl-host package. Remote Browser Use / Computer Use is outside this contract. Included top-level paths and required paths are different concepts; no deduplication, filtering or inferred expansion.

## Pure path API

Only dependency is `node:path`'s `posix` surface. All functions return strings synchronously except required-path builder returning a fresh string array synchronously.

1. `buildRemoteAgentOfficialPluginDir(remoteProviderDir: string): string`: POSIX join the supplied provider directory and exported DIR_NAME. No validation, quoting, home expansion, IO or mutation.
2. `buildRemoteAgentOfficialPluginSourceRelativePath(params: {runtimeResourceDir: string; platformArch: string}): string`: POSIX join params.runtimeResourceDir, params.platformArch, DIR_NAME, in that order. Parameter property reads occur during invocation, not captured elsewhere.
3. `buildRemoteAgentOfficialPluginRequiredPaths(remoteProviderDir: string): string[]`: compute plugin directory once through the directory builder, then map the current exported REQUIRED_RELATIVE_PATHS array in order, POSIX joining that directory with each relative path. No mutation or caching. Array mapping has standard JavaScript sparse/mutation behavior.

Use POSIX normalization on every host platform, preserving dot segments, redundant separators, absolute inputs, empty-string joining, and literal tilde/backslash behavior according to Node POSIX join. No sanitation or security policy. Any invalid runtime argument/type or mutated-array method error propagates synchronously unchanged; there are no custom errors or catch branches. No test/implementation/history bodies are included.

## Author boundary if used

Read only this packet and explicitly permitted root guidance/public declarations. Root curator has not deliberately read target bodies according to parent disclosure; earlier generic scanners may have processed bytes and broader context persists. This packet's curator has read the complete bound target source. Packet authoring does not reset either context or establish independent provenance. Fresh no-inherited-context authoring, exact input/output binding and declared access restrictions must be recorded separately for any later implementation. Do not claim OS isolation, MIT eligibility, novelty or full-owner replacement from this packet.
