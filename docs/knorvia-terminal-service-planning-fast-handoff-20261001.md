# Terminal startup planning checkpoint — first fixed-lane boundary

Start `8c463b2ee1361c1ccc68dec005a4b9eccbd1fce4`; same branch
`parallel/file-watcher-fast-20261001`. Scope: terminalService.ts planning decisions,
one narrowly named pure launch planner, two frozen test files,
[spec](../specs/knorvia-terminal-service-planning-fast-20261001.md) and this receipt.
Root alone integrates. Watcher/archive/portable/Mac checkpoints, public terminal.ts and
all profile implementations stay immutable. No new conversation/agent.

Service blob `02d002c74150a94321cd303e92dfac470f6c1945`, SHA-256
`0031c0f468e58c9fd4a67c723bfca146867f7ca8ea69c31d3ebae7d2c930bbdc`, matches
local start and cached recovery `08255eca46ea14de63dcead1a2ca76194187b772`.
Upstream-modified/NOASSERTION/review-null inventory, only imported-snapshot history;
no completed service replacement found in available local history. Upstream blob
`882d78ac39d4033b29c8a6b48a05368ba93bec95`. Public terminal.ts SHA-256 remains
`f840b36586ad17b93dd5fca7f411686d345127340c869e022cf558d05ea7f76c`.
Respect network restriction: no fetch/browse; freshness --no-fetch passed ahead77/behind0
versus cached origin/main. Remote tracking is absent; no new remote-freshness assertion.
The explicitly requested final branch push is the only permitted network operation.

Changed architecture: zero violations/baseline/new. Generated services context remains
legacy/unmanaged, no module/direct contracts. Actual callers: node.ts registration/export,
accessor.ts public service, useTerminalService.ts and TerminalSession.tsx. Windows metadata
is projected into xterm windowsPty. No caller, public terminal.ts or profile code is edited.

Spec precedes source replacement. Before edits, both source and strict emitted baselines
passed the same 76 cases, zero failures/skips: 69 actual service planning/load cases and
seven retained-helper guards. They freeze shell/PATH/cwd and locale/env precedence,
ConPTY options and eligible error fallback, Windows build prefixes, exact failure strings,
observation order, raw profile env, repeated creates, deferred lazy load and failed-load
retry. Fake-helper guards cover archive rewrites, X_OK/0755/recheck, discovery/missing-file
misses, once-only flags including after failure, non-Error wording and non-Darwin gating.
No native permission or process operation occurs. Fixtures preserve only synthetic env
values and Node's IPC marker. Baseline root types also passed with 5,422 matching keys.
Evidence: `/tmp/knorvia-terminal-plan-evidence/baseline-source.log`,
`baseline-emitted.log`, `typecheck-baseline.log`.

The author read inherited source; source exposure and retained declarations/expressions
are explicit. No clean-room, whole-file independence or MIT claim. LICENSE/NOTICE,
preview identity and all 27 material obligations remain. Lifecycle, lazy-loader implementation
and native-helper implementation are retained dependencies outside this first replacement.
Completed implementation and final acceptance receipts follow below.
