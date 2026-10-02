# Packaged material selection evidence

Owner: the read-only `scripts/packaged-runtime-evidence.mjs` audit utility. This extends its existing canonical-path and streaming SHA-256 checker; it does not change product code, packaging policy, release workflows, or global licensing inventories.

## Input and interface

Run `node scripts/packaged-runtime-evidence.mjs <disposable-built-directory> <selection.json>`. The caller supplies an idle, complete disposable artifact copy and an independently reviewed selection. The command reads only those inputs, prints JSON to stdout, and exits nonzero if validation fails. It never launches the product, extracts archives, writes files, or selects a user data directory.

Selection schema version 1:

```json
{
  "schemaVersion": 1,
  "files": [
    { "id": "runtime", "kind": "runtime", "path": "resources/app.asar", "noticeIds": ["notice"] },
    { "id": "native", "kind": "native", "path": "resources/tool.node", "noticeIds": ["notice"] },
    { "id": "notice", "kind": "notice", "path": "resources/THIRD-PARTY-NOTICES.md", "sha256": "<reviewed 64 lowercase hexadecimal digits>" }
  ],
  "excluded": [
    { "id": "other-platform", "path": "resources/other-platform.node", "policyRef": "<reviewed policy reference>", "reason": "<applicable exclusion>" }
  ]
}
```

Every `files` entry is required. At least one runtime/native entry and one notice entry are required. Runtime/native entries must reference at least one selected notice; each reference must resolve to a notice entry. Notice hashes are mandatory expected byte digests. Runtime/native hashes may also be supplied for comparison; their observed digests are always recorded. Exclusions are explicit exact paths with a policy reference and reason, never inferred from missing files or used to discharge a required notice. IDs and paths are unique across both lists. Paths use portable, relative forward-slash syntax without traversal, wildcards, or drive prefixes. Malformed or unknown fields fail rather than silently dropping requirements.

## Evidence and failure semantics

The exported `packagedMaterialEvidence(directory, selection)` returns the canonical root, selection-scoped results, and `ok`. Each selected file records its ID, kind, relative path, expected digest/references when supplied, status, and canonical path plus observed SHA-256 when readable. Missing files, mismatched hashes, and invalid inputs are failures. Missing notice references remain explicit errors even when other files exist. Excluded paths report `excluded-by-policy` only when absent; any existing entry (including a dangling symlink) is an `unexpected-present` failure. The report does not equate policy exclusion with an observed selected file.

The CLI additionally records the SHA-256 of the exact selection JSON bytes. A successful result means only that the declared selection matched that supplied artifact directory. It does not certify selection completeness, decide grants, clear material obligations, identify compiled-in source, or prove absence inside opaque archives. In particular, an absent unpacked Canvas path cannot prove absence inside `app.asar`; existing ASAR policy auditing remains separate. Readable selected symlinks are canonicalized and must remain within the supplied directory. Input errors exit nonzero; incomplete file evidence remains in the JSON report. The directory must remain unchanged during measurement; concurrent mutation is outside this offline interface.

## Acceptance fixtures and migration boundary

Use synthetic disposable directories only:

1. Runtime, native, and exact notice bytes produce known hashes; absent policy-excluded path is separately recorded. Existing packaged-runtime evidence behavior is unchanged.
2. Missing notice or native file fails as missing input, never as policy exclusion; wrong notice bytes fail with the observed digest retained.
3. Omitted required notice selection, empty selection, duplicate IDs/paths, unexpected fields, and traversal fail closed.
4. Present policy-excluded file or dangling link fails; selected links escaping the artifact directory fail without hashing external content.
5. CLI records the selection digest, emits the failing evidence, and exits nonzero for missing required notices.

This command is opt-in audit tooling. No release gate is wired into CI and no real build has been verified by these fixtures. Actual closure still requires the exact built directory, a reviewed platform-specific runtime/native/notice selection with expected notice digests, and any archive-content/native-link evidence that selection cannot establish.

## Verification recorded on 2026-10-02

`node --test packages/desktop/test/packaged-runtime-evidence.test.mjs`: 27/27 passed on Linux, Node 24.19.0; `git diff --check` passed. Windows was not available. This includes the seven unchanged runtime-evidence cases.

Required repository checks remain environment-blocked: typecheck cannot import `tsx`, lint cannot find `oxlint`, architecture cannot import `typescript`, and formatting cannot find `oxfmt`; `node_modules` is absent. The installed pnpm is 11.19.0 versus the repository's 10.33.2, and Node differs from `mise.toml`'s 24.14.0. Commands were attempted normally, then with `--config.verify-deps-before-run=false` to suppress pnpm's automatic installation attempt and expose the missing dependencies without fetching them. Architecture failed before and after the change, so there is no computed baseline/new-violation result. These audit-script and test paths are outside the module roots in `architecture-policy.yaml`; no module contract or dependency edge changed.
