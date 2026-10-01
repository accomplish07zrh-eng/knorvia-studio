# OffPeak execution boundary

Lane A continues from immutable AskUserQuestion checkpoint `7b37339` on
`parallel/cli-tools-fast-20261001`. Own only `off-peak.ts`, narrowly named local
helpers/tests/spec and the lane handoff. Cron, Todo, TaskOutput/TaskStop, other
lanes, shared provenance, public contracts, packages/lock/CI/security and user
data are outside the write boundary. All ports and records in tests are
synthetic. No task, prompt, billing/account connection or external service call
is authorized by this assignment.

## Exposure and lineage

The implementer inspected inherited handlers, public contracts and supported
consumers. The handler audit is upstream-modified/null review, fixed upstream
blob `14c52162582cd9a67855b290e5213fbdacceac98`, SHA-256
`dd5f7ca9437ef534f83a4f09bfd4d3996730525306d2ed7a0466539b34389ae3`.
Its history contains `7619e41` (publish latest preview). The schema remains
upstream-modified/null, blob `d5f96e8f60e383fcac213685cf7c0131256d509b`; the
OffPeakPort contract remains upstream-unchanged/null, blob
`c86b5160fa27c219d02a5115fe05ae0d41c2b7e9`. Bootstrap ports/policy are unreviewed.
This is exposed-source work. Public declarations, the exported idle-turn guard,
schema references, descriptions/instructions/error/output prose and applicable
licences remain retained compatibility material. No whole-file originality,
clean-room, MIT or whole-product independence claim follows. LICENSE/NOTICE,
preview identity and all 27 unresolved material obligations remain unchanged.
Root owns shared provenance regeneration and integration.

## Owners, design and effects

The host remains the sole task/ticket/quota/eligibility/persistence owner. The
existing protocol port owns pending-session lookup and transport translation;
the executor owns permission, hooks, turn flags, cancellation, deadlines and
serialization/trace. This replacement owns one per-call intent and its terminal
result/refusal, with exactly one existing port effect after admission.

```text
executor permission/admission → handler
  create: idle-turn guard → create schema → configured port → create once
  list:                    list schema   → configured port → list once
create result → success projection OR category/code decision → existing CoreError
```

Replace the duplicated imperative create/list bodies with a discriminated
admitted call and a sole effect interpreter. Keep the public guard signature and
behavior as retained material; inject that guard into the create interpreter
without a circular import or a second turn identity owner. Replace the nested
business-refusal switch with explicit category and ordered validation-code
policies, preserving field reads and messages. Do not merely extract old bodies.
No adapter, timer, retry, queue, cache, fallback, permission grant or public package
export is added. No contract or cross-module ownership changes.

## Frozen admission, port and projection contracts

- OffPeakCreate first calls the exported guard. A truthy offPeakTurn denies before
  schema access, missing-port checks or session access. automationTurn is never
  read or denied here. Ordinary automation turns remain allowed. The unchanged
  public guard also serves actual SendMessage, which retains its own schema-first
  ordering and recoverable foreground-Agent hint.
- Create then parses the strict, trimming public create schema, then checks the
  port. Invalid input produces the original ZodError before a missing-port error.
  No extra defaults or title/prompt/model/permission coercions are introduced.
- List parses its strict empty input and checks the port; it ignores both turn
  flags. It remains read-only/concurrent-safe with no creation effect.
- The configured-port check and invocation keep their original separate context
  reads. Invoke methods with the actual port as receiver; create takes exactly
  two arguments, including `{sessionId: context.sessionId}` even when undefined.
  List takes no arguments. Preserve one call, normalized input and session binding.
  Port throws/rejections propagate without reclassification, retries or cleanup.
- Direct handlers do not inspect abortSignal/trace or validate output. Executor
  cancellation/serialization remains authoritative. List returns the exact tasks
  array. Create returns the exact outcome.task object in task/message field order,
  with unchanged queued/no-position message branches and accessor multiplicity.
- Missing port raises the existing nonrecoverable ConfigurationError with
  toolCallId/toolName. Idle-turn denial remains PermissionDenied, recoverable
  false unless the exported guard option overrides it, retryable false.
- A falsey outcome.ok drives failure selection by errorCategory, with special
  client_validation codes model_not_allowed/session_bound/offpeak_disabled. Every
  other code retains the generic validation text. Quota/eligibility/network have
  their existing messages; remaining categories retain the existing fallback.
  Preserve failureStage/category/code values and field order in error context,
  ToolExecutionFailed type/business code, recoverable false and retryable false.
  Never infer category from errorCode or message, and never retry a quota failure.
- Preserve malformed raw outcomes and getter errors/read order; do not add new
  port outcome validation or strengthen public schemas in this bounded change.

## Declarations and supported consumers

Keep both public entries and the guard export. Freeze entry/property order,
runtime schema identities, descriptions/instructions, permission differences,
32000-byte truncate/head budgets, fixed 30000ms timeout/no override, cancellation
wording/cleanup and trace (create propagates to adapters, list does not).

Existing registry exposure is opt-in through includeOffPeak === true. Actual
runtime registration additionally requires an injected port and excludes
subagent_child; host policy remains disabled/default until explicitly enabled.
Do not reopen that product gate. Existing services/core turn-policy signals
distinguish offPeakTaskId, resume trace prefix and OffPeakCreate denylist from
ordinary automation mutation restrictions; preserve those consumer facts.

Exercise actual registry, executor, permission service, public SendMessage guard
consumer, protocol port and policy projection using synthetic responses. Protocol
tests preserve idle-run denial, bound-session pending statuses, terminal-status
allowance, lookup failure closed, explicit/own session precedence, normalized
request fields, success snapshots and unmodified discriminated failures. They
never instantiate a real client transport, account or task store. UI pure summary
projection may be tested if safely loadable; native/live rendering remains a gap.

## Acceptance sequence

Freeze and run inherited source/emitted declarations, admission/output/error and
failure-order contracts before production edits. Test-only
`KNORVIA_OFF_PEAK_TEST_EMITTED=1` selects existing dist modules; it has no product
effect. Use repository-standard tsx/module-mocking flags and pinned toolchain;
verify named-test counts under the approved execution capabilities rather than
counting isolated child files that did not execute tests.

After replacement run frozen source/emitted tests and actual supported consumers,
finite exact-checkpoint comparisons where useful, CLI builds, root/CLI types and
configured/explicit owned lint, formatting and changed/full architecture checks.
Run the final full offline regression with unchanged budgets. If production
changes afterward, repeat it. Record first failures and baseline failures; never
relax old tests or hide a failure with a timeout/security change. Native/live
user/account/host/CUA, desktop/Web visuals and packaged distribution acceptance
remain outside these Linux synthetic contracts. Push only the existing lane
branch, end clean and await root's next assignment in this same thread.

## Baseline failures and consumer facts

The first inherited source run executed 23 named tests: 19 passed, four failed
in new test wiring. The permission fixture passed the nested ToolEntry instead
of the executor's flattened runtime capability; it now uses the actual resolver.
An executor-result assertion incorrectly expected handler CoreError context and
recoverability: existing executor presentation projects type/message/code,
while the actual handler error retains category/stage/code and both flags. Tests
now verify both boundaries. A Proxy outcome observation omitted the Promise
assimilation `then` read, and the synthetic workspace omitted required
workspaceKey. A subsequent edit placed `then` in the success rather than failure
read sequence (21/23 in each mode); that assertion placement was corrected.
No inherited test, schema, permission, eligibility or quota guard was changed.

An execution-service transport disconnected while starting baseline validation;
the next same-workspace read succeeded, and subsequent named test execution was
verified. Uncommitted files were preserved; no reset, alternate environment,
credential/proxy/network/security configuration change or timeout change was used.
The existing approved execution capabilities permit standard isolated child
tests; the repository runner/security settings remain unchanged.
