# Fixed CLI lane WebSearch handoff

## Baseline and scope

Continue from `8813066819ba9b8862d589da9b7b86f0ca4497f0` on
`parallel/cli-tools-fast-20261001`. Own only the three WebSearch handlers,
narrow WebSearch private helpers/tests, specs/knorvia-websearch-execution.md
and this handoff. Prior handlers, evidence, ReadSessionContext/session selection,
other lanes, shared licensing/inventory, package/lock/CI/security are untouched.
No release, merge, deployment, live search/model/billing/notification or user-data
access. Root integrates and decides licences. No new conversation or agents.

All three targets remain inherited, upstream-modified, unreviewed, with no
changes since the assigned integrated base. The spec records exact current
digests, upstream blob facts and implementation/consumer boundaries. This is a
source-exposed replacement: retained public interfaces/prompts/comments and
applicable attribution remain, with no clean-room or final MIT claim. All 27
project material obligations remain unresolved. The parent byte evidence for
the earlier six entrypoints does not imply a WebSearch publisher-byte check.

## Frozen checkpoint before production edits

Actual source and emitted consumers passed 21 named tests each, zero skips/fails.
Frozen JSON records 43 direct stream/request cases, 45 raw result/projection
cases, nine executor cases, ten formatter cases, twelve month descriptions and
three getter/read-order probes. Source/emitted capture values were equal before
the replacement. Every response, model, request, clock and approval is synthetic.
Dynamic executor span bytes are replaced with a named marker only after presence
and exact propagation identity are observed; all other trace fields are retained.

Supported consumers exercised are builtInTools/registerBuiltInTools, actual
ToolRegistry and executor, permission capability/service, runtime invocation
wrapper/default status sink, and the provider-native SDK tool transformation.
No provider runner/request is executed. Native eligibility and automatic tool
choice are frozen alongside domain/quota arguments and receiver/signal identity.
Partial/no-finish/reordered/ignored/malformed/error streams, iterator cleanup,
usage/output validation, cancellation and deadline use synthetic streams/timers.
Recursive projection, sparse inherited slots, first-winner URL order, image-link
exclusion, raw malformed results and formatter failure boundaries are frozen.

The first baseline test attempt had three incorrect new-test assumptions:
built-in handlers expose an array rather than a direct WebSearch named export;
auto mode denies this network capability; an unrelated self-cycle never enters
result traversal. Tests were corrected against unchanged source, and the cycle
fixture now follows content recursively. Adapter denial assertions use the actual
AiSdkModelAdapterError/invalid_model_request rather than an absent CoreError enum.
No production behavior or inherited contract was altered to make tests pass.

Pre-edit freshness and changed architecture passed. An initial cli-core context
name was invalid; the actual policy module cli was then read successfully.
Owned lint covers all five TS test/fixture files with 94 rules, zero warnings/errors.
Its temporary configuration is the existing root policy with exclusion globs
removed so apps/cli is actually examined; no repository rule/config was modified.
Frozen data/prose are retained observations, distinct from new synthetic harness
control and fictional inputs. Passing contracts or changed hashes establish no
authorship or licence eligibility.

Final implementation/build/full-regression evidence follows after replacement.
