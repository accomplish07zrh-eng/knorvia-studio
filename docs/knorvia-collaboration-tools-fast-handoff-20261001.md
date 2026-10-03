# Fixed Fast CLI lane: collaboration checkpoint

Branch: `parallel/cli-tools-fast-20261001`. Baseline:
`8c669eb72b6a16afee0892dec76f5baccce0053f`. All earlier production/evidence
commits, including Agent/Task, remain immutable.

## Commits and ownership

- `d45bcc1`: spec first; freeze unchanged source and actual emitted contracts,
  malformed/getter/verdict behavior, declarations and supported consumers.
- `73cfdd5`: ordered request encoding, distinct invocation composition and lower
  message/response/submission outcome projection. No policy or runtime change.
- The appended evidence commit contains this handoff, the receipt and its local
  read-only checker; no additional production change.

Production ownership is exactly `send-message.ts`, `respond-to-coordinator.ts`,
`submit-result.ts` and new `collaboration-invocation.ts`,
`collaboration-request.ts`, `collaboration-result.ts`, all in
`apps/cli/packages/core/src/tool/handlers/`. Other ownership is the seven
`collaboration-tool-*` test/case/fixture/capture/golden files,
`specs/knorvia-collaboration-tool-invocation.md` and these three named evidence
files. The receipt enumerates all 17 allowed paths. Public declarations, runtime,
queue/profile/policy implementation, previous handlers, other lanes, licensing,
packages/locks/CI/security and user data are unchanged.

The confirmed executor interruption preserved local `d45bcc1` and all six
production files. A harmless read recovered the same checkout and showed exactly
that state. The retained diff was reviewed before committing. Completed logs from
the interrupted chain were inspected, then CLI build/types and both focused test
modes were rerun before final full regression. No reset, recreation, credential,
network/security configuration or alternative environment access occurred.

## Supported consumers and distinct gates

Actual built-in registration, registry/model contracts, executor call-runner,
PermissionService/capability, scheduler, batch executor, display and terminal
turn-control consumers run against source and actual dist. These tools have no
aliases; registration include/allow/deny flags and typed/generic SubmitResult
construction remain frozen. Emitted JS is read before import; absence fails
without tsx source fallback. All three public d.ts files are byte-for-byte frozen.

| Operation            | Admission after schema parse                                  | Existing effect boundary                                       | Turn behavior                                                                                      |
| -------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| SendMessage          | Unchanged OffPeak guard, then optional send-method truthiness | Bound subagent send method; one request plus signal option     | Nonterminal, including valid failed delivery outputs                                               |
| RespondToCoordinator | Exactly subagent scope, then coordinator port                 | Bound response method; one argument, no signal/routing options | Nonterminal, including valid failed queue outputs                                                  |
| submit_result        | Workflow port presence only; never reads runtimeScope         | Bound workflow respond method; await one verdict               | Accepted success triggers existing terminal metadata; rejection remains repairable handler failure |

SendMessage denies idle turns and allows ordinary automation turns. Response
scope denial short-circuits the port getter. Main-scope workflow actors can submit.
All parse/missing-port/read ordering, second receiver reads, method-before-request
evaluation, getter faults/native errors, field insertion, trace fallback and
original trace/result/output references remain. No model/override forwarding,
recipient policy, queue owner, cache, retry, persistence or notification is added.

Public metadata, permission/approval, plan-mode allowance, descriptions/prose,
provider-output versus strict runtime-schema differences, budgets and cancellation
text stay intact. Send/response keep their ten-second deadlines; submission keeps
no wall-clock timeout. Coordinator continuation precedes unbounded failure detail
and survives actual executor truncation. Existing executor interruption emits one
ToolCallError/cancelled telemetry finish and prevents late success/turn stop.

Submission retains truthy accept and malformed verdict behavior, sparse arrays,
map receiver/getter order and native error wording. Generic direct runtime parsing
can accept missing `result` as undefined, while executor declaration validation
requires the field; that existing distinction was frozen and preserved. Typed
declarations remain actor-frozen across calls, with their existing shallow nested
references and generic runtime validator. No deep freeze, clone or policy repair
was introduced. The real scheduler/batch/executor permits later groups on reject
and cancels them on accept; a separate repaired submission can then succeed.

## Validation and reproducible digests

Before production edits, source and actual emitted captures matched byte-for-byte:
103 direct cases, 81 context/method getter cases, 15 verdict probes, 28 executor
cases, six registry variants, six factory variants, 60 permission decisions and
29 formatter observations. The SendMessage matrix covers 144 combinations, SHA256
`48554c005038cc657628b141d829008e5e12276849d0db249789cae480feed4a`.
Both unchanged baseline and final rewrite pass 25 named tests per mode.

Frozen JSON: 364842 bytes, SHA256
`e44e70bdb0368fdf49de8cf0bc6858161d09767766ecc230315f9e49d3068d12`.
The receipt binds 14 current files to exact production commit `73cfdd5`, with
path/Git blob/raw/LF-normalized hashes, 21 emitted files, seven retained declaration
regions, 91 unchanged protected inputs and 27 unchanged lint inputs. Source tuple
SHA256: `e72a96cc4d2b907e321e760d7249ee3190c041445a7cea43e5bda4da2aaecb09`.
The receipt/checker/handoff are bound by the evidence commit rather than
self-referential file hashes. Run the checker on this lane or its detached
checkpoint; broader integration legitimately changes its protected scope.

Clocks, ports, recipients, approvals, model references and results are synthetic.
Generated executor span IDs are normalized only after presence/propagation checks;
incidental error stacks are omitted. Own undefined fields, reference identity,
receiver/read order and cancellation have separate assertions. The capture script
requires an explicit output path; final tests only read committed frozen data.
No actual agents, messages, models, accounts, output files or notifications are
used by these collaboration tests.

Using existing Node 24.14.0 / pnpm 10.33.2:

```sh
export PATH=/tmp/knorvia-lane-toolchain/node_modules/.bin:$PATH
pnpm build:cli-packages
pnpm --dir apps/cli typecheck
node --import tsx --test apps/cli/packages/core/test/collaboration-tool-*.test.ts
KNORVIA_COLLABORATION_TOOL_TEST_EMITTED=1 node --import tsx --test apps/cli/packages/core/test/collaboration-tool-*.test.ts
pnpm typecheck
pnpm lint
pnpm --dir apps/cli lint
pnpm fmt:check
pnpm architecture:check --changed
pnpm architecture:check
pnpm test:studio
node docs/evidence/knorvia-collaboration-tools-fast-receipt-check-20261001.mjs --emitted
```

Root/CLI types, actual CLI build (17/17 tasks), configured root/CLI lint,
formatting and architecture passed. Strict owned lint applies existing 94 rules
to all 12 source/test files with only temporary ignorePatterns cleared; zero
warnings/errors. The evidence checker separately passes syntax/lint. Broader core
lint remains blocked by 24 errors and 11 warnings in 27 unowned files, all
byte-identical to baseline. No checks, deadlines, rules or skips were relaxed.
CLI is unmanaged/unassigned in architecture policy; dependency direction and one
effect owner per operation were manually reviewed too.

Final full regression: 520 files, 6195 tests, 6187 passed, zero failures and
cancellations, eight existing skips, 353935.956061 ms. Seven skips require Windows
or PowerShell; one old/new Claude comparison lacks the old-root comparison input.
CLI build retains existing Turbo/lock workspace, large debug chunk and dynamic
import warnings; Windows CUA staging skips on this Linux host.

## Source exposure and release limits

All three inherited source paths were read. Local history records snapshot
`7619e41`; bytes match integrated `0d80f9c` and this slice's baseline. The spec and
receipt record their exact baseline and pinned publisher path/blob/digest facts
from `licensing/upstream-baseline.json`, ZCode
`872ad960de7ec172591f7e1952f7849229f94521`. No fresh publisher-byte verification
for these three paths is claimed. Parent's exact Agent publisher check is separate
reported evidence, and prior Agent artifacts are not rewritten.

New structure includes ordered context-field encoding, invocation-to-request
composition, message/response segment assembly, lazy submission outcome selection
and synthetic consumer assertions. Invocation retains constrained parse/gate/native
bound call expressions and configuration errors. Entry declarations, factory
comments and model-facing prose remain. Violation map/callback/lines spread/join
expressions remain because malformed/native behavior constrains them. Private
helpers and test patterns are source-exposed, including earlier lane patterns.
Moving a function does not establish independent expression. Frozen JSON contains
old declarations/prose/output/errors; it is not exclusively new test material.

Every file's whole-file licence determination remains unresolved, with explicit
retained material and conservative advisory status. These statuses are not valid
reviews.json decisions or licence grants. Existing attribution must remain.
Possible future bounded separation of declaration/prose assets could make the
remaining expressions reviewable; separation itself would not establish authorship.
Smallest remaining subset blockers are exact collaboration publisher-byte/notice
verification, retained-expression and author/right-to-license review, and root's
independent decision. No clean-room or whole-file MIT claim is made.

This older lane keeps its 27-obligation licensing inputs intact. Root reports
Keyv 4.5.4's complete original publisher LICENSE and exact four-file npm binding,
with all 928 old notice blocks preserved, closing only that obligation locally
to 26 at abbreviated `d109b32`. The receipt distinguishes this parent report from
local verification and imports no licensing change. Root's published `0dc764e`
and CI222 Linux 6914/6906/8/0 result also remain separate from this lane's actual
6195-test result; Windows was running at the parent report.

Native Windows/macOS, packaged desktop/UI, real subagent queue/background delivery,
workflow engine and external notification acceptance are not run in this synthetic
scope. Root owns native acceptance, integration, publication and licence decisions.
This lane ends at the appended checkpoint and awaits its next assignment here.
