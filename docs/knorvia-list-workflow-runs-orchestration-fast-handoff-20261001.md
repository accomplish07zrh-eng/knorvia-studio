# ListWorkflowRuns bounded orchestration handoff

Branch: `parallel/cli-tools-fast-20261001`. Baseline: `dfcce76627cd71e5fe7ff31194fb079d24114a1d`.

- Freeze/spec: `691741ce6dde081d42a685eaa28073612b109b0f`.
- Production: `6fa3a805c807da5482ca1f1f21590b777105e0c5`.
- Evidence commit is the appended commit containing this handoff and receipt; resolve with `git log -1 --format=%H -- docs/knorvia-list-workflow-runs-orchestration-fast-handoff-20261001.md`.

## Owned boundary and retained material

Only `apps/cli/packages/core/src/tool/handlers/list-workflow-runs.ts` and private `list-workflow-runs-operation.ts` changed in production. The directly bound operation owns schema admission, one captured port, one list call/await and ordered synchronous row projection. An ordered field table distinguishes mandatory values, undefined-tested optional values and truthy flags. No additional asynchronous forwarding, journal state, cache, retries, policy or event owner.

Preserved: schema-before-port ordering, method guard/invocation getter reads, receiver, exact session cwd spelling, default/clamped limit/status fields, adapter row order/repeats/sparse map behavior, optional double getter reads, truthy flags, malformed result exceptions, public schema identity/declarations, model text, metadata/permissions/budgets and the original 10-second timeout/cancellation declaration. Real deadline and full call-runner completion-edge cancellation match exact frozen baseline. Lower journal/introspection and executor remain unchanged.

Lineage: the snapshot and 88001f formatting commit are the only local handler changes before this slice; the latter wraps cancellation prose only. Existing ledger is upstream-modified with null review. Publisher blob/SHA are manifest facts only, without new local publisher-byte verification. Source was read; retained entrypoint prose/declarations, compatibility expressions and archived source remain attributable. Tests reuse earlier source-exposed fixtures; frozen model/error text and source archives are retained material, not wholly new test expression. No clean-room, whole-file originality or final MIT determination. Historical branch registers remain 27; root 26 is a separate parent-reported fact. Root owns licence decisions.

## Current verification

- Frozen and final focused source: 8/8; strict actual emitted: 8/8. 53 direct observations, 10 complete-executor paths and 108 completion edges per mode, plus early-abort controls, repeat/concurrent/stale and sparse/custom-map/method-swap/primitive-rejection comparisons.
- Related source registry/invocation/deadline/workflow-display regressions: 73/73 across 10 files.
- Final full suite: 527 files; 6278 tests, 6270 pass, 8 skip, 0 fail, 0 cancel. 365781.455627ms. This is the current historical lane checkout scope, not root's newer integrated test count.
- Root types (5422 matching locale keys), CLI types and 17-task CLI build passed (10 cached). Root/CLI configured lint passed; owned 6-file/94-rule lint has 0 errors and 2 intentional no-thenable fixture warnings.
- Core configured lint remains blocked by 24 errors and 11 warnings in 27 unchanged files, digest-bound in the receipt. No owned source violation or rule relaxation.
- Formatting and full/changed architecture passed. CLI is unmanaged/unassigned in the policy; direct public-contract imports, private helper direction and single operation/state owner manually reviewed.
- Existing build warnings: global Turbo fallback/missing browser-use-plugin lockfile workspace, large debug chunk, dynamic import options; Windows CUA staging skipped on Linux.

No demonstrated supported production regression was found. The original baseline source and actual project emission were frozen before implementation. No appended tests after the full-suite checkpoint. Earlier Escalate/WebFetch/Read/collaboration/Agent/PlanMode and other protected files remain byte-identical. Root Read/CI fixture repair was untouched.

## Digest check and gaps

Receipt: [digest-bound checks](evidence/knorvia-list-workflow-runs-orchestration-fast-checks-20261001.json). It binds 9 owned files, 287 protected inputs, 13 emitted artifacts, exact commit/blob/SHA256 and retained regions. Owned tuple SHA256: `fab6facb1a03437bc79eaf02954edd1d6888422eace517b8b2c5668953c320ec`.

```sh
node docs/evidence/knorvia-list-workflow-runs-orchestration-fast-receipt-check-20261001.mjs --emitted --logs
```

Omit `--logs` on another executor without the original local logs; omit `--emitted` until an exact CLI build. These flags control optional evidence availability only; owned/protected Git blobs and frozen source digests are always checked.

All handler ports, responses, clocks and request/output data are owned synthetic fixtures; fetch/DNS fail closed. No real journal/provider/model/network/notification/user files/accounts/credentials/settings effects. Native Windows/macOS and packaged/Electron/installer acceptance are unperformed; eight full-suite skips retain their platform/fixture reasons in the receipt. Root owns independent integration/native acceptance/publication. Retained material attribution and right-to-license review remain unresolved; a future bounded prose/archive separation could aid review without production changes here.

Awaiting the next assignment in this same conversation after a clean normal branch push.
