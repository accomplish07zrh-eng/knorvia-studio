# AskUserQuestion answer-result boundary

Lane A continues on `parallel/cli-tools-fast-20261001` from immutable checkpoint
`803062001bf433d967d84f716d520cdf34d6b943`. Own only AskUserQuestion and narrowly
named local helpers/tests/spec/evidence. Todo, TaskOutput/TaskStop, other lanes,
shared provenance, contracts, package/lock/CI/security and user data are outside
the write boundary. No actual user question or external action is authorized.

## Exposure and retained material

The implementer inspected inherited source, schemas and consumers. The existing
audit marks the handler upstream-modified/null review, fixed upstream blob
`e51ac0d494b741693daee2d1f2757a0c0f460018`, current SHA-256
`990090a2d9dcb27863a7ab270f8d4f8ed1d41bf63cf754ce0c2c0eeb6cf451f5`.
The public schema remains upstream-unchanged/null, blob
`3949c85e62c5ddec2d0509819ef8f904bd23f371`. Public declarations, schema references,
prompt and output prose, exception factory/wording and applicable licences remain
retained compatibility material. This is exposed-source work, not clean-room,
MIT, whole-file originality or whole-product independence. LICENSE/NOTICE,
preview identity and all 27 material obligations remain unchanged. Root owns
shared provenance regeneration and integration.

## Ownership and effects

The existing permission broker owns question publication, response collection,
request IDs, activation/readiness, racing responders and cancellation. Existing
executor admission owns strict public input validation, hooks, permission,
deadline accounting, child signals, lifecycle/trace and serialization. Existing
client projections own their display IDs. The handler never opens an interaction
or awaits user input; it only consumes already-collected answers.

```text
model input → executor admission → broker prepare → Requested → activate
                                                            └→ synthetic reply
reply → existing normalization/revalidation → answered-schema decision
                                           ├→ result projection → model narration
                                           └→ existing CoreError throw
```

Use a local, per-call answer decision with explicit return/refusal outcomes.
Reuse the public answered-input schema as the only semantic validator. Project
its accepted data in the required field order; turn refusal issues into the
existing error only at the async handler boundary, reading toolCallId lazily.
Replace the formatter's mapped parts/answers pipeline with a per-call text fold
and an explicit no-answer/partial/complete narration decision. Do not extract
the inherited functions unchanged. Preserve the existing membership/count
primitive and unvalidated formatter boundary where needed for exact observable
compatibility; disclose retained mechanics rather than classifying the whole
handler as newly authored. No cache, duplicate response owner, timer, adapter,
interaction port or public package export is added.

## Frozen admission and projection

- Handler uses AskUserQuestionAnsweredInputSchema.safeParse. Success returns
  questions/answers/annotations? in that order; metadata is omitted. Questions,
  options, previews, raw strings and multiSelect defaults come from that parse.
  No sorting, ID generation, answer re-keying, trimming or option substitution.
  Unknown answer/annotation question keys remain accepted by the existing schema.
- Empty, partial and complete answers are successful; answers missing entirely
  means collection has not completed. Blank answer strings fail, including keys
  that are not question texts. The handler does not treat skipped questions as
  denial or invent a preference. An empty annotations object remains present.
- Preserve all schema behavior: strict root/question/option/annotation/metadata
  shapes; 1–4 questions and 2–4 options; duplicate question/label issues; Other
  exclusion; multiSelect default false; option HTML-preview restrictions. Freeze
  actual behavior where prose is stronger than validation (for example header
  text length and previews on multiSelect); do not strengthen the schema here.
- On failure throw the existing recoverable ToolExecutionFailed CoreError:
  `AskUserQuestion requires user answers before execution`. Context contains
  ordered `{message,path}` issues, then toolCallId and AskUserQuestion toolName.
  Preserve issue order/paths and parser/accessor thrown values. Read no context
  field on success; read only toolCallId after issue projection on refusal.
- Direct execution does not read abortSignal, trace, cwd or ports. Executor owns
  cancellation; an already-aborted signal passed directly to the handler does
  not create a new handler cancellation gate. Calls retain no shared state.

## Frozen narration and metadata

- Empty own enumerable answers return the exact existing no-answers sentence
  before inspecting questions or annotations. Otherwise iterate Object.entries
  answer order (including integer-key order), with raw quoted question/answer
  text and comma-space delimiters. Do not order answers by the question array.
- For each answer, read the corresponding annotation before rendering it. Append
  truthy preview then truthy notes with the original spacing/newlines. Empty
  strings suppress text; optional getters retain their existing reads and throws.
- Count unanswered question slots using existing `in` membership, including
  inherited answer properties and ignoring sparse question holes. Preserve the
  exact partial/complete sentences and counts. Do not add output safeParse,
  escaping, sanitization or new recovery behavior to this formatter.
- Keep the sole public entry export/property order, capabilities and all schema
  identities. Keep both requiresUserInteraction flags, userInteraction scope,
  low risk, readOnly/concurrentSafe true, destructive false and needsApproval
  true. Preserve permission name/reason/patterns/precedence, 30000ms deadline with
  no override, 100000-byte truncate/head budgets, cancellation wording/cleanup,
  and required summary trace with propagateToAdapters false.

## Consumers and acceptance

Freeze the inherited declaration, valid output/text, malformed input CoreErrors,
and relevant raw-formatter/accessor behavior before any production edit. The
test-only `KNORVIA_ASK_QUESTION_TEST_EMITTED=1` selects dist modules; it has no
product effect. Exercise the actual built-in registry, executor and permission
broker with synthetic responses, plus existing protocol mapping and UI pure
question normalization. Preserve question order, label/value identity, generated
display IDs, previews, partial/empty answers and annotation keys.

Test malformed admission before a synthetic interaction, modify/allow/deny and
invalid modified replies, request/response trace IDs, cancellation before/during
the interaction, and the fixed deadline/permission-wait boundary. Use existing
timer mocks to advance the unchanged budget; do not lengthen deadlines or alter
security/interaction policy. No prompt reaches a real TUI, user or external app.

After replacement run source and emitted contracts, finite comparisons against
an exact-checkpoint temporary reference, applicable CLI build, root/CLI types
and lint, explicit owned-file lint, formatting and architecture. Run the full
offline regression on the final corrected source, with its unchanged timeout.
If a production correction follows that run, repeat the full regression. Record
baseline/test-wiring failures and skipped acceptance; never relax existing tests.

Synthetic Linux interactions do not establish actual user prompts, live desktop/
Web visuals, native Windows/macOS/CUA, real-user data, distribution licensing or
whole-product independence. End at a clean named-branch checkpoint for root.

## Baseline execution record

Before production edits, 19/19 named tests passed in both source and emitted
modes. The fixture freezes 41 input cases (11 accepted, 30 rejected) and 13 raw
formatter cases, full declarations/schema references and model-facing prose.
Initial consumer runs were 17/18: the new wait assertion used `perf` instead of
the existing executor's `performance` field. Correcting that test wiring retained
the 40000ms synthetic wait assertion and 30000ms unchanged handler budget.

Under the initial restricted command environment, isolated Node children
reported a passing file without executing its named tests, even for a minimal
JavaScript probe. Those results are discarded. A diagnostic direct/no-isolation
run registered all eight contract tests; the standard isolated runner registered
all named tests with approved additional execution/network capabilities. The
final source/emitted/full runs use the standard runner and verify named-test
counts. No repository runner, sandbox/security setting or timeout was altered.

Existing policy asks for AskUserQuestion in build, plan, auto and yolo, and keeps
hard disallowed-tool denial. It does not inherit Skill's reserved-auto behavior.
No interaction/policy implementation is changed by these fixtures.

## Replacement evidence

The frozen-spec/contracts checkpoint is `cde9b0c`; production replacement and
the finite comparison driver are `7d3066f`. Final validation, source hashes,
consumer coverage, baseline failures and remaining acceptance are recorded in
[the Lane A handoff](../docs/knorvia-cli-tools-fast-handoff-20261001.md#askuserquestion-continuation).
Public declarations, retained prose/licences and upstream obligations are not
reclassified by passing compatibility tests.
