# GetWorkflowRun snapshot-field checkpoint

Branch `parallel/cli-tools-fast-20261001`; baseline `e0da79ea15cf72dc2b7783aef83f97ef9290c48e`.

- Freeze/spec: `3c39501af4849f3971fecd845ea8bc68e4e7f15e`.
- Production: `1e54823d60c4fe8d10e245436a97c467bd459c0b`.
- Evidence: the appended commit containing this handoff and receipt (`git log -1 --format=%H -- docs/knorvia-get-workflow-run-snapshot-fast-handoff-20261001.md`).

Only `get-workflow-run.ts` and private `get-workflow-run-snapshot-fields.ts` changed in production. Ordered field schemas/interpreter replace inherited header/usage/actor/log conditional construction. The existing handler still owns its original schema/port admission, single await, result serialization, one clock read, roster/phases, remaining health/result/error/questions/artifacts and summary. There is no new state, async forwarding, retry, deadline, permission or IO owner.

The snapshot-plus-formatting history and ledger upstream-modified/null review showed no accepted replacement for this slice. Public declarations, schemas, description/model prose, permission/deadline/cancellation/trace metadata and remaining detail assembly remain unchanged. Undefined optional checks retain second getter reads; scriptPath reads cwd lazily; usage re-reads its parent for every counter; actor/log map receiver/callback/order/sparse behavior stays intact. Source exposure is explicit. Retained expressions, public prose and archived baseline remain attributable; no clean-room or whole-file MIT determination. Publisher blob facts are from the existing manifest, without new local publisher-byte verification. Historical lane registers remain27; root26 is separately parent-reported.

## Actual checks

- Frozen and final source/strict emitted: **6/6 each**.44 direct observations,10 complete-executor paths and112 real deadline/full-call-runner completion-edge comparisons per mode, plus early-abort controls, concurrent/stale completion, repeated/changing usage getters and custom map callbacks.
- Immediate source consumers: **64/64** across8 registry/deadline/invocation/workflow-display files.
- Core package emission and core/root types passed; root locale parity5422 keys. Root configured lint passed. Owned6-file/94-rule lint:0 errors,2 intentional no-thenable fixture warnings.
- Core configured lint retains24 errors/11 warnings in27 unchanged files. Their exact hashes are bound in the receipt; no rule/budget changes.
- Formatting and full/changed architecture passed. CLI remains unmanaged/unassigned; public-contract import direction, pure projection and existing single effect/state owners manually reviewed.

A default executor variant initially reported only a file-level test (also reproduced with the previous handler control). Those observations are preserved as harness-discrepancy evidence and do not count as focused validation. The supported executor invocation reports all six named tests in normal source/emitted mode. No runner isolation, test budget or product policy was changed. Full result comparisons found no supported production difference.

The user reduced cadence: **no full suite, full CLI build or desktop build** was run for this slice. Earlier e0da79e's6278-test full run is historical, not current validation. Root owns aggregate publication gates. The only emission is the relevant core package's actual tsc output.

## Evidence and remaining scope

[Receipt](evidence/knorvia-get-workflow-run-snapshot-fast-checks-20261001.json) binds **9 owned files,309 protected inputs,21 emitted artifacts**. Owned tuple SHA256: `8956129ec68a6fd5ca050db3ef0cfa390797d63ab0e11c600462bd2ccd7e47ff`.

```sh
node docs/evidence/knorvia-get-workflow-run-snapshot-fast-receipt-check-20261001.mjs --emitted --logs
```

Without original local logs omit `--logs`; without exact core emission omit `--emitted`. Owned/protected Git blobs, frozen source/observation digests and retained regions remain mandatory. Root should review the exact checkpoint rather than infer authorship from new filenames, hashes or passing tests.

All journal/result/getter/clock/thenable data is owned synthetic. No live workflows/providers/network/files/accounts/user data/credentials/settings effects. Native Windows/macOS, packaged desktop/installer acceptance and aggregate publication gates were not performed. Source/expression attribution and right-to-license decisions remain unresolved. Remaining inherited handler responsibility includes admission/serialization/time/roster integration and health/result/error/question/artifact/summary assembly; lower helpers were deliberately left unchanged. Root-owned runtime admission/queue and all prior accepted handlers/evidence remain byte-identical.
