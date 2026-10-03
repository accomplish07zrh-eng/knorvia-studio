# Write transaction boundary

2026-09-30. Replace Write orchestration while retaining its public declaration and model wording. Preserve permission, raw text, encoding, atomic expected-revision writes, memory-origin stamping, snapshots, patch output and telemetry. Author exposure to the previous implementation remains recorded; no clean-room or MIT grant is asserted.

## Contract and ownership

Schema → configured filesystem port → workspace path → one attempted text read → Write-specific freshness admission if existing → stamp proposed content → one atomic conditional write → update the existing session read-state map → metadata callback → output/patch. The port captured at admission owns both read and write. Do not add stat calls, retries, another cache, or a fallback writer. A read not_found alone permits creation; all other read and admission errors propagate. Failed writes do not update state or metadata; metadata failure happens after committed write/state and propagates without fake rollback.

Write freshness deliberately differs from Edit and must not reuse Edit's weaker policy. Existing files require an eligible latest nonpartial snapshot even if the runtime map is absent. Revision ID differences take precedence; then integer-millisecond advance/size difference when both mtimes exist; otherwise known-size difference and a strict full-read content difference apply. An identical strict full-read content snapshot can recover from stale revision/metadata. Limited or offset snapshots cannot use that recovery.

The user-provided replacement text stays raw (including CRLF and literal dollars). Existing encoding, line-ending preference and exact revision object are forwarded. New files leave these fields undefined. Creating an empty file and overwriting an existing empty file both retain the legacy `create` output with empty patch and null originalFile; the latter still requires freshness admission. Do not silently reclassify it. All IO retains the original signal and trace fields. Output keeps input path spelling; adapters use resolved paths. Successful full snapshots use sourceTool Write, floor returned mtime, returned size or UTF-8 fallback, and preserve the existing metadata schema.

## Acceptance

Freeze synthetic-port cases against unchanged Write first, covering error identity, operation ordering, missing/empty files, no-state and partial-state rejection, stale/revision/mtime/size/content combinations, raw text, one-write semantics, revision identity, metadata failures and memory-origin stamping. Then replay source and actual emitted code, run a deterministic old/new transaction differential and complete normal root/CLI quality/build/full-test gates. Preserve native-platform gaps and source/license obligations. No real user files are modified by these fixtures.

The baseline memory-origin helper stamps a parsed mapping `metadata: {}` but currently leaves frontmatter with no metadata mapping unchanged. Freeze both observed dependency outcomes for this transaction replacement; do not claim all memory documents receive a new origin. Any change to that separate policy requires its own specification and callers' regression coverage.

Subsequent origin-policy repair is defined in `knorvia-memory-origin.md`: valid root mappings without metadata now receive a proper YAML mapping node and origin. The former fallback contract is deliberately updated to test that correction; Write's transaction ordering, freshness and conditional-write semantics stay unchanged.
