# Claude-native ingestion leaves: frozen compatibility and implementation plan

2026-09-30. Exact base: `8e8f6310d5ca70a57a454054e44f7b61db30b83f`, fetched and verified as PR7 head. Branch: `cloud/services-claude-leaf-20260930-fast-2057`. The previous session projection and automation batches are handed off and are not replayed or edited.

The five owned paths in `packages/services/src/session/claude-native/` are `jsonLineRecord.ts`, `sessionHistoryJsonl.ts`, `importedClaudeTaskFileFilter.ts`, `claudeNativeSessionHeadParser.ts`, `buildImportedClaudeTaskFile.ts`. Supporting specs/tests/evidence stay within packages/services. ImportRepo/importParser/importService/persistence, Creation, schema, UI, shared, other tracks, package manifests, lockfiles and shared provenance ledgers are excluded.

## Source review and state ownership

At the fixed upstream `zai-org/ZCode@872ad960de7ec172591f7e1952f7849229f94521`, all five have matching paths and concrete Git blobs. Four are upstream-unchanged; builder is upstream-modified. None is presumed original. The author read existing source and consumers to extract contracts, and inspected upstream object bindings. Exposure is disclosed; this is not clean-room work.

Implementation review must distinguish new algorithm expression (cursor scanning, compiled indexed path traversal, unified text projection, incremental hash feeding) from retained standard guards, Node IO/JSON/clone delegation, regex/protocol/schema literals, title and trace factories. A source-exposed rewrite is reviewable evidence but does not by itself establish whole-file independent authorship, MIT eligibility or replacement completion. Keep Apache-2.0 and existing notices. The shared ledger is not edited by this worker.

ImportRepo remains the filesystem scan/filter/sort owner; importParser owns full transcript projection; importService owns copy/persist/event sequencing. The leaves hold only invocation-local derived state. No accepted queue, global cache, persistence path, schema or runtime configuration is added. Existing shared public factories and sessionTitle are consumed without edits.

## Frozen API and data behavior

### JSON/string guards and readers

- `isObjectRecord` accepts all non-null objects except arrays, including Date/Map/boxed/prototyped objects; functions/primitives are rejected. `readTrimmedString` trims actual strings only, returns undefined for empty strings and does not coerce boxed/non-string input. Tiny standard guard expressions are retained, not cosmetically rewritten.
- Both readers delegate UTF-8 decoding to Node and JSON decoding to the native JSON parser. Return every valid JSON value, including primitives/arrays/null, despite the declared JsonLineRecord type; preserve unknown fields/order and do not add schema validation or BOM removal. Invalid UTF-8 bytes retain Node replacement behavior. Blank means `line.trim().length === 0`.
- Full read first awaits the existing native `readFile(..., "utf-8")`. It splits only LF or CRLF; bare CR inside a line is retained. Empty/whitespace-only lines are ignored; a JSON error is numbered by nonblank position, not physical line. Trailing nonterminated lines are parsed; a truncated tail rejects the whole read. Keep exact `[claude-native] 解析 JSONL 失败 <path>:<number> <native reason>` errors and native file errors.
- Head keeps the existing createReadStream/readline framing with crlfDelay Infinity, therefore bare CR is a delimiter there. It counts physical lines including blanks, stops after at least maxLines nonblank JSON records and ignores malformed tails beyond the limit. maxLines <= 0 resolves [] without filesystem access; fractions round upward through comparison, NaN/Infinity read all. Preserve cleanup on success, limit exit, parse/file failure. Do not reinterpret runtime-null/string/invalid path inputs or add custom errors.
- Performance change: full-read line scanning uses a cursor and one current slice instead of full-file split/filter arrays. Node's whole-file read/decode remains, so this is reduced auxiliary allocation rather than bounded total file memory. Preserve full-read IO-before-parse order.

### Path filtering

- Always structuredClone before reading filter paths; preserve native clone errors and discard clone-ineligible/nonenumerable/custom prototype detail exactly as Node does. Return a new clone without mutating input; cyclic links and sparse array slots are retained by clone.
- Paths are visited in caller order, including duplicates. Split each path on literal dots. An empty path/segment stops traversal. Dots in keys are not escaped. Ordinary segments traverse non-array objects only; leaf segments delete the named property with native delete semantics. Unknown fields survive unless explicitly addressed.
- A segment ending `[]` resolves its prefix key on a non-array object and traverses only an actual array. Preserve for-of order and hole visitation. A wildcard at the path's end traverses items with no deletion; nested arrays are not implicitly traversed. An empty wildcard prefix addresses key "". Do not prohibit inherited properties or silently sanitize arbitrary paths.
- Preserve exported default array order/mutability: meta.mode, meta.model, meta.provider, messages[].model. No caching across calls that could ignore caller mutation. Malformed path values/iterables and clone failures retain their old order/native error class/message.
- Performance change: compile each selector into one indexed segment plan. Recursion remains for observable native stack failures; no per-level rest-array copies. This changes auxiliary path copying from quadratic to linear while preserving sequential mutation order. Do not advertise exact native stack-depth thresholds as portable guarantees.

### Head projection

- File order wins; no timestamp sorting. Extract user and assistant visibility for each visited entry. First visible assistant/user with a nonempty cwd selects workspace (entry.cwd -> message.cwd -> request.cwd). First visible user returns `{workspacePath, previewTitle, createdAt}` in that field order; without any visible user return only `{workspacePath}`, including an explicit undefined value.
- User requires type=user and no strict-true isMeta marker at entry/message. Content precedence is message.content ?? request.prompt. Strings are sanitized directly. Arrays skip holes, strings and non-tool_result object text/content contribute, and fragments join with double newlines.
- Assistant requires type=assistant and excludes strict-true isApiErrorMessage at entry/message and a trimmed model equal to `<synthetic>`. Arrays include strings and only type=text objects, joined without a separator. This differs from the full import parser's API-error visibility rule; do not unify the two semantics.
- Sanitization replaces whole case-insensitive ide_opened_file and command/local-command tag blocks with one space each, then CRLF->LF and trim. Preserve malformed/unclosed tags and the old cross-name closing-tag regex behavior. Object fragment text wins when its trimmed value is nonempty, else content fallback.
- Timestamp precedence is timestamp, createdAt, updatedAt, created_at, updated_at, time, message timestamp/createdAt/updatedAt, request.timestamp. Candidates are read before conversion as in the existing API. Finite values strictly >1e12 are truncated milliseconds; >1e9 are truncated seconds\*1000; <=1e9 are invalid. Trimmed numeric strings follow the same rules before Date.parse; nonfinite/invalid candidates are skipped. CreatedAt is only the first visible user's timestamp.
- Sidechain uses array-some semantics (including hole skipping/short circuit) and strict true at entry/message/request; unknown fields and truthy nonbooleans do not qualify. Native malformed/null record errors remain. Input is unchanged.
- Extended JS arrays preserve custom flatMap/filter, native species failures, subclass and proxy access behavior through a retained compatibility adapter. Ordinary JSON arrays use the new indexed collector. This adapter remains inherited expression, not an independent authorship claim.
- Performance change: one shared visible-text projector emits fragments without per-fragment flatMap arrays and a second filter pass. Keep sparse-array visitation and user/assistant differences; do not change the full import parser.

### Imported task builder

- Reject empty messages before ID/trace generation. Task override uses nullish semantics, so empty string wins. Stable ID remains `claude-import-` plus the first 24 lowercase SHA256 hex characters of UTF-8 `claude:<workspacePath>:<sessionId>`. No path normalization. Native template coercion, Unicode/lone-surrogate handling and coercion order remain.
- Generate exactly one trace using the existing shared factory before title/timestamp projection failure. Explicit trimmed title wins; else find the first user with nonempty trimmed content and derive the title from its original untrimmed text; absent user yields Imported session. Retain UTF-16 50-unit title boundaries via the existing dependency.
- createdAt is finite source.createdAt else source.updatedAt. updatedAt is finite source.updatedAt else createdAt, then Math.max(createdAt, updatedAt), including NaN/Infinity. Meta key order: taskId, traceId, title, workspacePath, createdAt, updatedAt, mode=build, migrationSource=claudeCode, status=completed, optional truthy model. Provider/status/migrationSource on source do not replace these facts.
- Messages are spread into a fresh array before clone/filter; sparse source holes become explicit undefined slots and extra array properties are discarded. Deep-clone unknown message fields, preserve message order, and ignore unknown source/meta fields. Clone occurs before default model deletion, so an uncloneable filtered field still fails. Custom filterPaths and mutation of the default array remain supported; filtering retains field order and input isolation.
- Incremental hash feeding avoids the intermediate combined input string for long identities; the stable hash protocol and existing short title/schema expressions remain retained facts, not a standalone authorship claim.

## Verification

Commit explicit expected fixtures first and run old source and old emitted JS before production changes. Test malformed/truncated JSONL, blank numbering, LF/CRLF/bare CR, UTF-8/BOM/replacement, limits, sparse/cyclic/unknown fields, filter order, tag/role/model/time boundaries, exact errors/property order and input isolation. Exercise unchanged real head-scan repository via synthetic injected roots only, full importParser and legacy snapshot codec; never scan real HOME or user data. Compare old/new declarations and JSON round trips. Test new allocation behavior separately, keeping expected old performance failures distinct from compatibility passes.

Run scoped services/shared/RPC build, required root typecheck/lint, changed architecture and owned formatting. The integrator owns combined full-repo/CLI/GUI/native-platform gates and shared provenance reconciliation. Only push the dedicated branch and return cherry-pick order at this checkpoint.
