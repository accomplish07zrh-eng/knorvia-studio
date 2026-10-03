# Escalate orchestration lane checkpoint

Fixed branch `parallel/cli-tools-fast-20261001`, baseline
`d6214b9059bd7e7bf95e26f19d2c47170e640a4e`. Root owns integration, licensing and
native acceptance. Prior production/evidence remains immutable, including WebFetch,
Read, Agent, PlanMode and collaboration. No runtime, registration, permission,
security, dependency, runner, CI, shared inventory or user-data changes.

## Commits and owned boundary

| Commit                                     | Result                                                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `2b762a3c09f7ed4e512f0f95990ec6592c5594c6` | Spec and original source/strict emitted freeze before production; exact source/compiler archive and supported-consumer tests |
| `3e8396cd4ad424ee194cacb1d04b5273c1c6e8aa` | One directly bound operation, ordered request field readers and synchronous outcome projection                               |

Owned production:
`apps/cli/packages/core/src/tool/handlers/escalate.ts` and
`escalate-operation.ts`. Seven named `core/test/escalate-orchestration*` files,
`specs/knorvia-escalate-orchestration.md` and three lane evidence/handoff files are
the complete allowed scope. Production changed by 85 insertions/45 deletions across
the two files; this count is scope evidence, not an originality determination.

The operation factory supplies the original handler slot directly. Synchronous
ordered readers encode the optional request field and answered/fallback-refused
output; the one async operation owns schema/admission/invocation/projection and the
original single port await. There is no extra async forwarding promise, state,
cache, notification, persistence, retry or turn-stop layer. The workflow port keeps
recipient identity, question/budget/waiting ownership. Existing executor owns
permission, cancellation, events, metadata and telemetry.

Public entry/formatter/trace resolver, preamble and description are retained exact
regions. Public d.ts and schema identity stay unchanged. Schema still precedes
context reads; the presence gate reads the port first, then the call expression
reads it again and looks up the method before constructing arguments, preserving
that second receiver. Context absence versus empty string, trace fallback/read
order, own undefined output fields and property flags remain. Only kind answered
selects answered output; every other kind retains the original refused projection.
Valid refusal is success and never terminates the actor turn. The tool still has
timeout kind none, verified through actual deadline/call-runner and a synthetic
hour of waiting followed by external cancellation. No test timeout was added.

## Selection, lineage and retained material

The current implementation ledger records Escalate as upstream-modified/null
review, and its recorded digest exactly matched the baseline source. Local history
has only snapshot `7619e41b950bd52073ebf36754146cf25659d9fa`. No accepted dedicated
Escalate orchestration replacement was found. Write/Edit and Glob/Grep already
delegate to replacement boundaries/specs; their source/tests and existing lower
owners are protected rather than rewritten.

Baseline Escalate: 7066 bytes, blob
`dd0ed773f94065120c3220dd4167183f179bf487`, SHA256
`c8615b59f041967785d1151c59e19c01706a12c28f0d02a1f2d36426f891c658`.
Existing publisher manifest records ZCode
`872ad960de7ec172591f7e1952f7849229f94521`, path
`apps/zcode-cli/packages/core/src/tool/handlers/escalate.ts`, 7064 bytes, blob
`fe6c11fd9052c511c80ce6b33d9f102b5095f76d`, normalized SHA256
`548d1ad0e88467f42e7eb612bf049018b14cbfbfa42db46db1d16076266cc71e`.
These are manifest facts; no new exact publisher-byte verification is claimed.

Inherited source was read. The original schema/guard/error expression, two-read
port admission, field/discriminant vocabulary, single-await semantics and some
compatibility expressions remain after exposure. Ordered codec/projection/control
structure is newly arranged, informed by earlier source-exposed lane patterns.
Public prose/declarations/comments/formatter/trace resolver remain. The archive
contains the complete old implementation/compiler output, and golden fixtures
contain retained prose/output/errors. New synthetic fixture expression is distinct
from that retained material; hashes, new paths, moves and passing tests do not prove
authorship. No clean-room or whole-file MIT claim is made. Advisory unresolved
statuses are not shared review/licensing decisions.

Existing attribution, root LICENSE/NOTICE, shared inventories and historical lane
registers with 27 material obligations remain untouched. Root separately reports 26;
no new project-wide eligibility follows. Publisher material/notice and retained
expression/prose/archive attribution/right-to-license review remain unresolved.
A possible future bounded separation of retained public prose/baseline fixtures
could aid review; no such production/licensing change is made now.

## Frozen consumers and completion evidence

Unchanged source and strict actual emitted captures matched byte-for-byte before
production. Raw capture SHA256
`40b3e6de3b36a482e5aaddb815d3b996a09d3dbbdd204a43cd919c3a250307db`;
the same JSON observations, formatted for the repository, have golden SHA256
`c7573190f9a4120a714aeba2d9c8b7701a30d058fa86b31f9897a46f85e53175`.
The archive's source is the exact baseline blob; compiled SHA256
`fce3439c842bb4e4cfb98ebe7725d05ce97fe0a47cca52444628d1530a54524d`.
TypeScript 6.0.2 ESNext/esModuleInterop output was byte-identical to actual baseline
project emission before replacement. Archive loading changes only import locations.
Strict emitted selection reads actual dist files and fails if missing, with no
source fallback.

The original 15 tests per mode already included completion acceptance; no tests
were appended after production/full-suite execution in this slice. They replay
51 direct cases, 57 getter probes, 44 full-executor observations, eight registry and
six runtime-initialization observations. They cover schema/port errors, thrown and
rejected values, getter failures, then-getter failure, synchronous/thenable/delayed
fulfillment, double settlement, malformed outcomes, distinct runtime scopes and
trace/optional-field/receiver/read order. Actual registry/runtime consumers keep
includeEscalate presence and allowed/disallowed filtering; model formatter and
metadata are preserved. Existing permission rejection/hook denial/pre-cancel paths
perform no workflow effect.

Completion comparisons use actual deadline settlement and complete call-runner,
with a synchronous observation wrapper returning the original promise. Answered
and refused outcomes, synchronous and thenable ports, port acceptance and
projection beginning/completion, immediate through six queued abort microtasks
produce 84 cases per driver. Four early/uncancelled controls per driver plus two
delayed/stale concurrent observations give 178 exact baseline comparisons per mode.
Outputs, result metadata, model content, serialization, terminal result/error
events and Completed/Cancelled telemetry match. Late cancelled answers publish no
duplicate terminal event/telemetry and do not affect the next successful call.
Repeat calls invoke once each. No supported difference was found and no product
bug/policy repair was made.

| Driver               | Edge comparisons | Completed | Cancelled | Canonical observation SHA256                                       |
| -------------------- | ---------------: | --------: | --------: | ------------------------------------------------------------------ |
| Actual deadline      |               84 |        54 |        30 | `f725c9d701ac45978b0a6bbbe6dc87114a310fb41b01793b793576360affd854` |
| Complete call-runner |               84 |        54 |        30 | `30702d2af6fda650315b5ac04d445e6131670b4cd003703a13857994539a7c3b` |

Only owned synthetic input/outcome/clock/approval/workflow/event/telemetry fixtures
are used. No real agents, communications, model/provider/HTTP/DNS, output/user
files, credentials, account or settings actions. Fetch/DNS functions fail closed
in process. Incidental stacks and generated executor spans/permission IDs are
normalized after presence/propagation/identity checks; no prose/error/effect order
is normalized. Output own keys, descriptors and undefined fields are observed.

Two initial harness assumptions failed on unchanged source and are preserved in
the receipt's pre-freeze failure log: JSON omits undefined aliases (separately
asserted), and an already-aborted invocation records Cancelled telemetry without a
terminal event because it never started. The corrected freeze asserts those
original contracts. Intentional thenable fixtures produce two no-thenable lint
warnings; no lint suppression or rule relaxation was used.

## Actual gates and native gaps

| Gate                                                           | Actual result                                                                                                           |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Original freeze source / strict emitted                        | 15/15 per mode                                                                                                          |
| Final source / strict emitted                                  | 15/15 per mode, including 178 baseline comparisons per mode                                                             |
| Related registry/invocation/deadline/collaboration regressions | 85/85, source mode only                                                                                                 |
| CLI build                                                      | 17 tasks successful, 10 cached                                                                                          |
| CLI / root types                                               | Passed; root 5422 i18n keys                                                                                             |
| Configured root / CLI lint                                     | Zero warnings/errors                                                                                                    |
| Owned source/test lint                                         | Seven files, 94 rules, zero errors/two intentional thenable warnings                                                    |
| Configured core lint                                           | 24 errors/11 warnings in 27 unchanged unowned files; not passed                                                         |
| Format / full and changed architecture                         | Passed; zero violations/baseline/new. CLI unmanaged/unassigned, dependency direction and single owner manually reviewed |
| Final full regression at `3e8396c`                             | 526 files, 6270 tests, 6262 passed, eight skipped, zero failures/cancellations; 401527.342813ms                         |

Final receipt-only format/lint/architecture/digest gates are separately bound in
the JSON evidence. Existing build warnings remain: global Turbo fallback, missing
browser-use-plugin lockfile workspace, large debug chunk, dynamic import options
and Linux skip of Windows CUA staging. No budgets/runner/configuration were changed.
Full count is this historical lane scope, separate from root's combined batches.
Native Windows/macOS, actual workflow routing/notifications/long-lived cleanup,
real models/services and packaged UI/Electron/installer acceptance remain
unperformed by these synthetic fixtures. Root owns native acceptance and release.

The status command ran after the reported disconnect notice; retained commands
completed. There is no persistent executor blocker. No reset/recreation, alternate
environment or network/security setting change was used. Root reports WebFetch
review 805 comparisons per mode, 29 tests per mode and 26 artifact digests, and exact
`c9c5566` Read/graph recovery from a verified bundle. Those are parent-reported
facts, not locally imported or claimed as independent verification here.

## Reproducible digest check

[Receipt](evidence/knorvia-escalate-orchestration-fast-checks-20261001.json) binds
10 owned source/test/spec files at exact production commit, 265 protected inputs,
16 emitted files, frozen/archive/retained regions and actual log hashes. Tuple
SHA256 for exact commit/path/blob/byte/raw/normalized bindings:
`3605b20a7d41a74ab745e06f0cc1adf6b02ebd255ee218e295945e11733a1c76`.
Receipt/checker/handoff are evidence additions rather than self-hashed inputs.

```sh
node docs/evidence/knorvia-escalate-orchestration-fast-receipt-check-20261001.mjs
node docs/evidence/knorvia-escalate-orchestration-fast-receipt-check-20261001.mjs --emitted
node docs/evidence/knorvia-escalate-orchestration-fast-receipt-check-20261001.mjs --emitted --logs
```

The last mode requires recorded ephemeral `/tmp` logs. Checks validate schema,
ancestry, allowed scope, exact owned/protected/unchanged-lint/optional emitted/log
bytes, baseline/upstream ledger facts, original compiler archive, frozen declaration,
retained regions and canonical cancellation matrices. Reproduce with the matching
CLI build. Root independently reviews/integrates/licenses; this fixed lane awaits
the next assignment in this same conversation.
