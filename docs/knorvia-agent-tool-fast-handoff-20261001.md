# Fixed Fast CLI lane: Agent / Task checkpoint

Branch: `parallel/cli-tools-fast-20261001`. Baseline:
`13f1401f79b65aee7de12f3ba982e89ce3673d07`. Prior checkpoints remain immutable.

## Appended commits and owned paths

- `26555c5`: spec first; freeze unchanged source and actual emitted behavior,
  exact public declarations, schemas, metadata, descriptions and consumers.
- `5adf964`: one private invocation owner, ordered parent/location/trace field
  encoding and iterative model text projection. Public entrypoint declarations,
  descriptions, profile factories and policy remain intact.
- `b651aa9`: use actual cancellation event enums and assert one error and one
  cancelled telemetry finish after delayed synthetic completion.
- The final evidence commit contains this handoff, the digest receipt and its
  read-only checker; it makes no production change.

Production ownership is exactly `apps/cli/packages/core/src/tool/handlers/agent.ts`
and new `agent-invocation.ts`, `agent-request.ts`, `agent-projection.ts` siblings.
Other ownership: `specs/knorvia-agent-tool-invocation.md`, six `agent-tool-*` test,
case, fixture, capture and frozen JSON files, and the three named handoff/evidence
files. The receipt enumerates all 14 allowed paths. No shared provenance,
declarations, runtime/profile implementation, packages, locks, CI, security or
other lane source changed. All earlier handler/helper bytes are protected.

## Actual consumers and retained behavior

The real built-in registry creates both Agent/Task factories only when Agent
registration is enabled, forwards profile/search/workflow gates, and keeps Task
hidden from provider contracts. Both names share handler and schema identity.
Actual compatibility dispatch/hook aliases and real executor call-runner,
permission capability and PermissionService consumers run in source and strict
emitted modes. Missing emitted JS fails before import; no source fallback is
accepted. Exact `agent.d.ts` is frozen.

Schema parse precedes the missing port guard. Task's missing port error still
names Agent. Request/trace insertion order, repeated identity reads, receiver and
launch-getter ordering, undefined own fields, default type, exact Read/Bash
visibility and conditional double model/override reads remain observable.
Foreground/background results keep their references at the handler boundary.
Formatting preserves all inherited text, empty-content handling, ordered usage,
visibility branches, raw malformed output and serialization exceptions.
Cancellation, rejection, delayed completion, hook/permission refusal and
pre-cancellation retain the existing executor/runtime boundary. No second child
owner, task cache, retry, filesystem output or notification mechanism is added.

## Validation and reproduction

Before production edits, source and actual emitted captures matched byte-for-byte:
40 direct cases, 20 getter-order cases, 24 formatting cases, 11 executor cases,
12 description variants, five registry variants, 40 permission decisions and a
512-combination projection digest. Freeze tests passed 21 named cases per mode;
the final registry forwarding assertion increases this to 22 per mode.

Frozen JSON is 237540 bytes, SHA256
`a7cc872e6442912c19c3c20d239a73eb8065aeacb97ee9fd6a0d93a9bfd0165e`.
The 512-comparison projection SHA256 is
`87abfc70a8624d93d793a44ab5318f4cd1ea48f4adbba34594f5e529b8fb81a8`.
The receipt binds 11 current files to commit `b651aa9`, 11 actual emitted files,
56 unchanged protected inputs and 27 unchanged lint inputs. Its source tuple
SHA256 is `fcc11cae338c90dd3795e3d778d967a2baa15b774851d2d966c105013ee5db46`;
the checker validates path/blob/raw/LF digests, retained regions and scope.
Generated executor span IDs are normalized only after presence and propagation
identity checks; undefined own fields and reference identities have separate
assertions. All launches, model references, approval replies, output paths and
clocks are synthetic. No actual child, model request, user data, output file or
external notification is used by these tests.

Commands use Node 24.14.0 and pnpm 10.33.2 from the existing lane toolchain:

```sh
export PATH=/tmp/knorvia-lane-toolchain/node_modules/.bin:$PATH
pnpm build:cli-packages
node --import tsx --test apps/cli/packages/core/test/agent-tool-*.test.ts
KNORVIA_AGENT_TOOL_TEST_EMITTED=1 node --import tsx --test apps/cli/packages/core/test/agent-tool-*.test.ts
pnpm typecheck
pnpm --dir apps/cli typecheck
pnpm lint
pnpm --dir apps/cli lint
pnpm fmt:check
pnpm architecture:check --changed
pnpm architecture:check
pnpm test:studio
node docs/evidence/knorvia-agent-tool-fast-receipt-check-20261001.mjs --emitted
```

Root/CLI types, actual CLI build (17/17 tasks), configured root/CLI lint,
architecture (zero baseline/new violations), and formatting passed. Strict owned
lint applies the existing 94 root rules to ten actual files using a temporary
config whose only difference is an empty ignore list. Root configured lint
checks the evidence validator too. Broader core package lint still fails with
24 errors and 11 warnings in 27 unowned files, all byte-identical to baseline;
the receipt records every path/hash. No rules, budgets, tests or skips were
relaxed. CLI is an unmanaged architecture module; dependency direction and one
launch owner were manually inspected as well as running the checker.

An initial full run passed 6162/6170 tests across 518 files (eight existing skips,
zero failures/cancellations). Review caught the cancellation test's nonexistent
event name: `b651aa9` corrected it to the actual event enums and terminal telemetry.
Both final focused modes passed 22/22. The final full rerun passed 6162/6170 tests
across 518 files, with zero failures/cancellations and the same eight existing
skips, in 351773.353275 ms. The receipt binds both run logs.
Production `5adf964` stayed immutable.

## Source exposure and licence boundary

The inherited Agent source was read. It is identical at integrated head
`0d80f9ca37b1daef162ecc69bd18f6e8fc30a146` and this slice's baseline: 12392 bytes,
SHA256 `d4f4f62adc998fdd38d449e38f09b4d4ff7cb68592c91cdf3d353fe261e81f3f`.
Local path history records only snapshot `7619e41`. The pinned upstream manifest
records ZCode `872ad960de7ec172591f7e1952f7849229f94521`, Agent publisher blob
`1261884c65ce46529504704c8a54cc4d7ff77bed`, SHA256
`e29decfaf6c16083368850f8e7f2285c821dd3c6b53b0cf1f5816fbf6fdf3aac`.
These publisher facts are manifest evidence; this lane did not perform a fresh
publisher-byte check for Agent. Root's earlier seven-path verification did not
include Agent and is not relabelled as local evidence for this file.

New expression includes the ordered field codec, single invocation composition,
content/usage row iteration and synthetic assertion/harness structures. Existing
declaration and description blocks and alias/factory tail remain; the declaration
block differs only in its two implementation references. The receipt proves those
regions exactly. Invocation retains the configuration error and constrained
native launch/guard/conditional expressions. Request projection retains the
Read/Bash visibility predicate and public field meanings. Projection retains all
model-facing prose, templates, newline/usage labels and malformed fallback.
Frozen JSON contains old prose/declarations/errors/output expression, not merely
new test expression. Tests use that inherited material and existing fixture
patterns; changed hashes and successful tests establish compatibility, not
authorship or rights.

Candidate whole-file determinations remain unresolved for all production files;
attribution must remain. A possible later bounded slice could separate inherited
declaration/prose assets from implementation, with independent digest review of
each remaining expression; moving text itself would not establish originality.
Release blockers for this subset remain retained material review, exact Agent
publisher-byte/notice verification, authorship/right-to-license evidence and
root's independent decisions. LICENSE/NOTICE, preview identity and the 27
material obligations remain unchanged. No clean-room or final MIT claim is made.

Native Windows/macOS, packaged UI/desktop, actual child runtime, output file and
background notification acceptance are not run in this synthetic scope. The
Linux build skips Windows CUA staging; the full suite's existing Windows/
PowerShell and missing-old-root comparison skips remain disclosed. Root owns
native acceptance, integration, licensing and publication. This lane awaits its
next assignment in the same conversation.
