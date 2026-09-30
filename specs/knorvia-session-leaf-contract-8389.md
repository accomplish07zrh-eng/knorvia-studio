# Session leaf compatibility contract (8389)

2026-09-30. Base: `8e8f6310d5ca70a57a454054e44f7b61db30b83f`, verified against PR 7 and `recovery/independent-logging-20260930-0456`.

This bounded batch owns only `packages/services/src/session/{sessionTitle,taskChangeSummary,mcpWorkspaceScope}.ts`, its new test, this specification and its acceptance report. It changes no persisted schema, public type, package configuration, shared implementation or provenance ledger. The existing Host/session services retain all lifecycle, approval, cancellation, admission and resume state. These helpers produce transient values and do not own accepted state.

The author has read the current implementations to extract observable behavior. No source-independent specification covering these helpers was found. This is a source-exposed behavioral reimplementation, not a clean-room exercise or evidence of MIT eligibility. Existing root Apache-2.0 obligations remain applicable. The inventory marks all three production files `upstream-modified`, with no accepted review, rather than merely unmatched/unreviewed. Original source and its Git history remain evidence.

## Frozen observable behavior

### Session title

- A nonempty prompt wins over attachments, including whitespace-only content. Return its first 50 UTF-16 code units and append ASCII `...` only when the original length exceeds 50. Do not trim, normalize newlines or repair split surrogate pairs.
- With empty content, return the first attachment filename verbatim. Append ` +N` for the number of additional attachments. No attachment means the empty string. Attachment order and inputs remain unchanged.

### File change summaries

- Missing or empty history yields an empty per-turn `Map` and an undefined task summary. Empty snapshot groups are skipped. A history containing only empty groups has no task summary.
- A path is an exact case-sensitive string key, including empty strings and names such as `__proto__`. Neither separators nor spelling are normalized.
- Visit groups and snapshots in supplied array order, regardless of numeric turn index or `fileState`. Retain a path's first `beforeContent`, its last `afterContent`, the arithmetic sum of supplied `writeCount` values and the last visited group's `turnIndex`. Do not infer previous contents or chronological order.
- Per-turn aggregation restarts for each nonempty group. A repeated turn index replaces the previous summary in the `Map` while retaining the key's original insertion position. An empty later group does not replace an existing value.
- Use the existing shared `computeLineChangeStat` public dependency with the aggregated endpoints, preserving newline and large-diff behavior. Include zero-diff files and zero/negative counts; this helper is a projection, not validation.
- Sort files using the existing default `path.localeCompare` ordering. Totals are the sums of the resulting individual file stats. Preserve serialized property order: summary `{fileCount, added, removed, files}`, file `{path, added, removed, writeCount, lastTurnIndex}`. Do not mutate source history.

### Temporary filesystem MCP scope

- The public function remains synchronous. Undefined/empty server collections return the identical input. Trim the workspace; an empty or nonexistent local path returns the identical collection. Existing regular files also qualify under the existing existence-only rule.
- Only an object containing `command`, named exactly `filesystem`, and having an argument containing `@modelcontextprotocol/server-filesystem` qualifies. HTTP/SSE or similarly named servers remain unchanged. Preserve package-token substring matching.
- Compare all arguments against the trimmed workspace using native `path.normalize`, stripping trailing slash/backslash runs and lowercasing only on Windows. Do not resolve symlinks, require a directory, canonicalize absolute paths or infer a remote workspace identity.
- Append the trimmed, unnormalized workspace only when absent. Return the identical collection when no append occurs. On change, return a new array; copy only changed server objects and their `args` arrays, preserving unrelated server/object references and all fields. Do not persist configuration. A second application is idempotent.
- Retain native exceptions for invalid runtime inputs; introduce no validation, fallback or translated error. The synchronous existence probe is required by the unchanged synchronous API.

## Design and verification

Use one private file-summary accumulator for both projections, so no new domain state or alternate write path is introduced. Use a lazy copy-on-write server projection for ephemeral MCP expansion. Keep existing public imports and entrypoints.

The new contract test must pass against the untouched base before implementation. It covers exact UTF-16/title boundaries, duplicate paths and turn IDs, nonchronological/reverted groups, null/empty endpoints, zero diffs, input immutability and JSON shapes, MCP eligibility, nonexistent paths, path normalization, identity and idempotence. Windows case folding is exercised with a restored platform probe; native Windows path execution remains a parent CI responsibility.

After implementation, run the same contract suite, relevant shared line-diff tests, services/shared/provider/RPC TypeScript build, required root typecheck/lint, changed architecture and focused formatting. Record actual failures and platform limitations. Tests establish bounded compatibility evidence, not whole-application completion or licensing clearance. The parent integrator owns full CI, inventory reconciliation and cherry-picking.
