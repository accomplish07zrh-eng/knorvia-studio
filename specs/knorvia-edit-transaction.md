# Edit admission and write transaction

2026-09-30. Extend the frozen boundary of the existing Edit handler before replacing its orchestration. Preserve all existing public schema, permission, model-content, matching, memory-origin, patch and telemetry contracts. This is not a license grant or a declaration that the full tool is independently replaced.

## Ownership and ordering

Input schema → configured FileSystemPort → no-change/path admission → stat → existing-file read → read-state admission → match and replacement plan → one atomic conditional write → update the same ReadFileStateMap → record metadata → return structured patch and non-enumerable telemetry. Missing files with an empty old string take the existing create path without a preceding read. Existing whitespace-only files still require valid read state. The adapter owns actual filesystem access and expected-revision enforcement; no second cache, hidden read, fallback write, or retry is introduced.

All filesystem calls retain the original AbortSignal and five trace fields. Stat errors other than not_found and read/write errors propagate unchanged. A rejected write must leave read state and metadata untouched. Metadata callback errors occur after a successful write and state update and must propagate; do not pretend to roll back a committed write. A missing runtime read-state map keeps its existing opt-out behavior. Permission approval remains required; this handler does not itself perform the permission UI.

## Frozen compatibility boundaries

- NO_CHANGE precedes stat. Empty path is the existing INVALID_PATH result. Missing port remains a configuration exception even for identical old/new input
- File size strictly greater than 1 GiB rejects before read; the exact boundary is allowed. Notebook restriction follows the empty-old branch and precedes read-state admission for ordinary replacements
- Missing snapshots or partial views reject; latest matching path entry is authoritative. Integer-millisecond watermark advancement or size difference wins when both mtimes exist; otherwise size/revision fallback applies. An unchanged full-read content snapshot may recover from stale metadata; a limited/range view may not
- Missing-file suggestions preserve stem priority, lexical ordering, type filtering and UTF-16 distance threshold 3. Failed directory listing never replaces the original missing-file envelope
- Replacement dollar characters are literal. Deleting a matched non-newline string also consumes the following newline when present, as previously implemented. Existing matching strategy precedence is unchanged
- Output paths preserve the caller's input spelling, while adapter paths are workspace-resolved. Creation keeps original new-string line endings; existing-file edits normalize CRLF to LF before planning and retain adapter encoding/line-ending policy on write
- Successful snapshots are full Edit-origin views. The adapter's returned revision and byte size determine metadata; absent size uses UTF-8 content byte length. No real credentials or user data belong in these fixtures

## Acceptance

First run synthetic-port transaction cases against the unmodified handler, asserting exact error envelopes, unchanged error identity, side-effect order, argument identity and read-state/metadata results. Add source and emitted replay only after baseline passes. Implement replacement in cohesive modules below the 400-line source limit, reuse existing pure matching and filename-suggestion paths, and label any mechanically retained interface declarations as such. Then run differential replay, root/CLI type/lint/format/architecture, CLI build, complete offline regression and exact-head native CI. Keep platform limitations separate from passed checks.

## Confirmed empty-match nontermination repair

The frozen matcher can return an empty actual string for a nonempty whitespace search (for example, file `\nnext`, old string `\t`). The former handler's nonoverlapping occurrence loop advances by zero and never returns. This was reproduced in an isolated synthetic-port process with a four-second external timeout; no user file was touched. This is a deliberate bugfix rather than a compatibility claim: when the actual fragment is empty and the file is nonempty, report the existing AMBIGUOUS_REPLACE envelope with `content.length + 1` insertion boundaries, without any write or snapshot change. Preserve the old empty-file insertion behavior and explicit empty-old create path. Do not change the matcher API, replaceAll strategy rules, tool timeout, cancellation budget or permission contract.
