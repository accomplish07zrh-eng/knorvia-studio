# Fixed CLI lane PlanMode handoff

Start at `20dfa27920af26f9e56a142073ec6d1b18193ffe` on the existing
`parallel/cli-tools-fast-20261001` branch. Earlier production/evidence commits
remain immutable. Scope is plan-mode.ts, narrowly named private helpers/tests,
spec and this handoff/receipt. Prompts, shared contracts/policies/runtime writer,
other handlers, licensing/provenance, package/lock/CI/security and root work stay
unchanged. No actual user plan, approval, process, model, credential or OS change.

The inherited handler is unchanged since `0d80f9c`, follows `7619e41`, and is
audited upstream-modified/unreviewed. The spec records exact baseline/current
handler/prompt digests and manifest upstream blobs. No new publisher-byte check
is claimed for PlanMode. Inspected source, public declarations, prose and retained
expressions remain attribution-bearing mixed material; no clean-room or whole-file
MIT determination. Root owns licensing decisions and all 27 material obligations.

Before production changes, source and strict emitted suites passed 21 named tests
each, zero failure/skip. Their snapshots match: 67 direct scenarios, eight actual
executor scenarios, nine getter probes, two embedded-search descriptions and two
actual registry contract variants, plus exact public emitted .d.ts text. Missing
emitted JS fails before import; there is no source fallback. Synthetic ports use
fictional plan text and in-memory session/filesystem/approval effects only.

The first baseline suite passed 20 tests and failed one incorrect new-test
assumption: registry executionMode is unset, rather than an explicit client value.
The assertion was corrected against unchanged production, and complete registry
contract/key snapshots were added. No public or policy behavior was changed to
make tests pass. Baseline contracts include malformed methods and native error
text; throwing session/filesystem/trace getters, rejection and interruption,
cancelled and non-cancelled persistence, repeat transitions and exact receivers.

Frozen policy boundaries: schemas precede missing-port access; Exit admission
uses the optional enabled method and nullish-only mode fallback. Persistence
is awaited before exit; its cancellation blocks exit, its ordinary errors currently
continue. The inherited Enter approval prose and actual direct-allow policy are
both preserved. Exit approval/denial and plan-mode read-only safeguards remain
owned by the existing executor/PermissionService. allowedPrompts are projected
descriptions, not executable commands or new permission grants. Plan schema is
20,000 UTF-16 code units; model/inline/preview byte limits stay 100,000.

Freshness and changed architecture passed; the actual CLI architecture context
was read. No environment was reset or recreated following the parent's 08:36 UTC
disconnect notifications: a harmless current filesystem read succeeded and the
existing test session completed. Root's WebSearch publisher-byte/integration
evidence is parent-reported context, not a local PlanMode publisher verification.

Frozen contract checkpoint: `081103f`; frozen JSON is 401,241 bytes, SHA-256
`1203c6ee9f741d898d6c06dd7a6a17cf6fc641f6331497ee2ab3c0611dfabd98`.
The JSON remains unchanged after production replacement. Capture is an explicit
baseline-only script; final tests read the committed gold and never regenerate it.

## Implementation and retained boundaries

Implementation `4d075cfa497bdce8467d7b5ff4d022ec6c7ac943` owns four production
files: plan-mode.ts, plan-mode-operation.ts, plan-mode-persistence.ts and
plan-mode-projection.ts under core/src/tool/handlers. The entrypoint keeps its
public entries/factory and declarations. One PlanModeOperation constructs a typed
intent, validates schema, admits the session, awaits Exit persistence and selects
one receiver-bound session effect, then projects the original result.

The operation is the only execution driver; SessionModePort remains the session
state owner. No accepted-plan cache, extra state transition, queue, approval
owner, retry or rollback is added. Enter keeps its immediate transition before
the first await; Exit keeps its persistence await before the transition. Effect
closures use the original named port expressions so malformed methods retain
their native error text. Context port reads are not cached or reordered.

The persistence helper constructs the writer intent and classifies rejected
effects at the existing cancellation boundary. The existing runtime writer is
byte-identical and executes only through fake filesystem ports in tests.
The projection helper contains original output/trace expressions and formatter
prose. Both helpers are below the operation and never import the compatibility
entrypoint; no circular or reverse dependency is introduced.

This is a control-flow replacement, not a whole-file originality finding:

| Owned production file    | Actual retained material                                                                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| plan-mode.ts             | Public entries/factory and metadata/schema/permission/budget/timeout/cancellation/trace declarations, reason prose and prompt imports.                                                                                      |
| plan-mode-operation.ts   | Schema and optional active-plan admission expressions; configuration/inactive error prose and context; named port invocation expressions needed for native failures. Intent/operation/effect selection is newly structured. |
| plan-mode-persistence.ts | Existing skip/await/cancellation-versus-other-error semantics; native writer input/trace fields and cancellation cause/context/message. The runtime writer and policy remain unchanged.                                     |
| plan-mode-projection.ts  | Output field shapes/read order, trace fields, model-facing prose, raw interpolation/trim/failure expressions. Moving retained prose is explicitly not claimed as independent authorship.                                    |

Frozen fixtures retain inherited declaration, prompt, output and error prose.
New synthetic harness/control expression and fictional inputs are distinguished
from these captured bytes. Root independently reviews attribution, licence status
and all 27 unresolved obligations. No shared provenance or licensing record was
changed, and no changed hash/line count/test pass is used as authorship evidence.

## Validation and gaps

[Digest receipt](evidence/knorvia-plan-mode-fast-checks-20261001.json) binds twelve
spec/production/test files and eight unchanged declaration/prompt/runtime/fixture
inputs to exact commits, Git blobs and raw/LF SHA-256. It records exact lint
baseline paths/digests, source exposure, retained material and verification scope.
Every prior handler/evidence and other out-of-scope tracked path is unchanged.

- Final source and strict rebuilt emitted suites: 21 passed each, zero failure,
  cancellation or skip, including exact emitted public declaration text.
- Native path, atomic/createParents/utf8 flags, raw text, exact signal/trace,
  receiver/call counts and awaited write-before-exit are asserted separately.
- Real registry/executor/PermissionService cover all five modes with explicit
  enabled/false/fallback and hard denial; synthetic approval waiting/rejection,
  denied feedback/turn metadata, cancellation, hooks/schema rejection and deadline.
- Root typecheck passed, including 5,422 i18n matching keys; configured CLI and
  core typechecks passed. CLI build passed 17/17 tasks, ten cached.
- Root lint passed on 2,841 files; configured CLI lint passed on 97. Owned lint
  examined ten TS/MTS files with 94 existing rules, zero warnings/errors, using
  the temporary root policy with ignore globs cleared, without repository changes.
- Configured broader core lint fails with 24 errors/11 warnings across 27 unowned
  files, each byte-identical to `20dfa27`; no rules or exclusions were relaxed.
- Root formatting passed on 5,905 files before the final receipt; final receipt
  and handoff formatting are checked separately. Changed/full architecture
  passed with zero new or baseline violations.

The first full offline regression passed: 6,148 tests across 516 files, 6,140
passed, eight skipped, zero failed/cancelled, 349,054.560ms. Follow-up test commit
`768c79b` wraps three remaining executor assertions in the fixed synthetic clock;
both source/strict emitted suites again pass all 21. Production, frozen JSON,
timeout and skip policies remain unchanged. The repeated final full suite passed
after that test correction: 6,148 tests across 516 files, 6,140 passed,
eight existing skips, zero failures/cancellations, 347,892.400ms. It retained the
same 120,000ms timeout and concurrency two. Skips are seven Windows/PowerShell
acceptance cases and one optional Claude comparison without its old-root input.

Linux build skipped Windows Cua driver staging and retains existing debug chunk
size and CLI/TUI dynamic-import-option warnings. Native Windows/macOS and GUI
acceptance were not run. Owned PlanMode tests invoke fake filesystem/session/
approval ports; no user plan, product process/model/network/credential/billing
or OS adapter effect was executed through these handlers.
Unperformed fresh PlanMode publisher-byte verification and retained source material remain
licence-review gaps; no clean-room or whole-file MIT eligibility is asserted.

## Reproduce

Use pinned Node 24.14.0 / pnpm 10.33.2. Run `pnpm build:cli-packages`, then
`node --import tsx --test` with plan-mode-contract.test.ts,
plan-mode-effects.test.ts and plan-mode-consumers.test.ts under
apps/cli/packages/core/test. Repeat with `KNORVIA_PLAN_MODE_TEST_EMITTED=1`;
the strict loader reads the actual .js dist before import and fails if absent.
Do not regenerate baseline capture from current production. The frozen commit,
its .json and exact original declarations/errors are the immutable reference.

Receipt digest and Git-object verification from repository root is read-only:

```js
// node --input-type=module
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const git = promisify(execFile);
const receipt = JSON.parse(
  await readFile("docs/evidence/knorvia-plan-mode-fast-checks-20261001.json", "utf8"),
);
for (const file of [...receipt.fileDigests, ...receipt.protectedInputs]) {
  const bytes = await readFile(file.path);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
  const { stdout } = await git("git", ["rev-parse", `${file.commit}:${file.path}`]);
  assert.equal(stdout.trim(), file.gitBlob);
}
```
