# CLI model catalog and workflow model references

Lane A continuation on `parallel/cli-tools-fast-20261001`. Behavioral base:
`0d80f9ca37b1daef162ecc69bd18f6e8fc30a146`; the immutable Skill checkpoint ends
at `e7c1cd91c47aaa28f8dff9d5ef8e4fd671e11c37`. Scope is ListModels,
model-reference and narrowly named local helpers/tests. Existing workflow tools,
TaskOutput/TaskStop, shared schemas, provenance, manifests, lockfiles and CI are
outside the write boundary.

## Source exposure and lineage

The implementer inspected the inherited implementations and consumers. The audit
classifies ListModels/model-reference as upstream-modified, with null reviews;
their fixed upstream blobs are `89c47e1dd00749cf78df1375dc3ff3376a463bb7` and
`e36fb4d796e030887c3895bff2ccc837c9df69a8`. The public ListModels schema and
ModelCatalogPort are upstream-unchanged and remain unchanged here. Exact public
declarations, schema references, model-facing strings and diagnostic wording are
retained compatibility material. This is exposed-source behavioral replacement,
not a clean-room or MIT claim. Keep LICENSE/NOTICE, preview identity and all 27
unresolved material obligations. Root regenerates shared provenance after
integration; this lane supplies factual evidence only.

## Owners and design

The host owns the live catalog. ModelCatalogPort returns its synchronous current
view on each request. The existing executor owns admission, permission, lifecycle
events, trace summaries, serialization, UI display projection and deadlines.
CreateWorkflow/AmendWorkflow continue to own their admission and run requests.
Neither model discovery nor resolution changes the main agent's model.

```text
host live catalog ── zero-argument synchronous port read ── ListModels projection
                                                        └─ schema → model text
workflow model input ── per-call catalog name index → choice policy → canonical value
                                                          └─ bounded diagnostic
existing workflow admission → existing approval → existing run request
```

Replace the inherited filtering resolver with a per-call, query-specific name
index and an explicit selection outcome. Qualified queries index model names only
under the requested normalized provider; bare queries index model names across
providers. Preserve original entry references and insertion order; discard the
index after each call. Keep diagnostics behind that outcome and reuse the public
model-selection codec for canonical values and handler parsing. No cache,
registry, configuration writer or retained state is added.

ListModels uses an ordered field projection and a schema-gated text writer.
Separate the retained declaration from that local execution/projection boundary;
do not move the old map/spread/parts implementation into a helper. No new public
package export or cross-module contract is needed. All new helpers belong to the
existing unmanaged CLI module and import existing public contracts.

## Frozen ListModels behavior

- Preserve the public entry, declaration values/property order, input/output
  schema object identities and built-in registry consumers. Empty strict object
  input only; parse before reading modelCatalogPort. Missing means strictly
  undefined; return the existing `{result:false,errorCode:31,message}` business
  failure instead of an empty catalog. Null/malformed ports are not rescued.
- Read `port.listModels()` exactly once synchronously with its receiver and zero
  arguments. Do not read cwd, trace or abort signal in the handler and do not pass
  new arguments into the catalog port. Adapter/read/projection errors propagate
  unchanged, without retry, fallback or a new error wrapper.
- Find the first truthy current entry before projecting rows. Preserve current
  even if disabled. Omit current when absent; do not synthesize an empty value.
  Preserve full entry order and duplicate rows; no sorting, pagination, filtering
  or cap is added. Projection keys remain id/providerId/modelId/providerLabel?/
  reasoningLevels/defaultReasoningLevel?/contextWindow?/disabledReason?. Optional
  values are omitted only for undefined; empty strings, zero and raw catalog
  spelling remain intact. Copy reasoningLevels, preserve its order, and omit
  source-only fields such as current. Do not mutate the catalog or its entries.
- Formatter validates the entire strict output schema. Invalid output yields
  `ListModels returned an invalid result.`; accessor failures still throw. Keep
  the exact empty-catalog sentence and `<models count="N">` wrapper. Nonempty
  rows keep id, optional provider label, comma-joined levels and optional default,
  then [current] and [disabled: reason] in that order. Empty level arrays suppress
  the default text even if a default exists. Do not trim or escape strings.
- Keep readOnly/concurrentSafe true, destructive/needsApproval false, none scope,
  low risk, listModels permission and toolName patterns, beforeAsk precedence,
  truncate/head budgets of 24000 bytes, fixed 10000ms timeout with no override,
  cancellation unsupported and exact cancellation wording. Trace remains required
  with summary input/output and propagateToAdapters false.

## Frozen model-reference behavior

- Preserve exactly the four existing exports and their consumer semantics:
  resolveModelReference, parseWorkflowSubagentModel,
  describeWorkflowSubagentModel and formatModelCatalogId. No I/O or async boundary.
- Trim the overall reference for matching but retain original text in errors.
  Search the first `$` after the first slash (or offset zero without a slash).
  Only a separator strictly after that search offset and before the final
  character introduces a level. Empty-side suffixes and literal dollars remain
  part of the reference when that condition fails. A leading slash uses bare
  model-name matching. Additional slashes stay in the modelId.
- Comparisons trim and lowercase both tokens. Qualified provider/model references
  use only the named provider; never fall back to a bare name or providerLabel.
  Bare names span providers. Disabled means disabledReason is not undefined,
  including the empty string. Partition matches before choosing a current entry.
- No matches: candidates are every enabled catalog entry in original order.
  Diagnostic lists at most 40 entries with current markers and exact overflow
  wording, while candidates retains the full list. No enabled entries keeps the
  existing no-models sentence. All matching entries disabled: preserve all
  matches and reasons. Multiple enabled matches: select the first truthy current
  entry; otherwise ambiguous with all enabled matches. This applies to duplicate
  qualified entries as well. Never silently prefer a different provider.
- Explicit reasoning level matches the first trimmed/case-insensitive catalog
  level, retaining its original spelling. Unknown levels fail after model choice
  with that selected entry as the sole candidate. Without a suffix, use the raw
  default only when levels is nonempty and default is defined; do not validate it
  against the levels or invent a default. Empty defaults remain in selection
  options, while the shared picker formatter preserves its existing omission.
- Success preserves selection key order, the original entry identity and the
  codec's canonical spelling. Failures preserve ok/reason/message/candidates
  order and all exact model-facing messages. Candidate objects are not cloned.
- Handler parsing returns undefined only for undefined; otherwise delegate to
  parseModelPickerValue and retain the exact outer error and original cause.
  Description returns an empty string only for undefined. Catalog id is the raw
  `providerId/modelId` without level, trim, normalization or validation.
- CreateWorkflow continues to resolve before file access/approval; unresolved
  names are business failures. AmendWorkflow's string/null/omitted model choices,
  inherited re-resolution and catalog-missing behavior remain with its existing
  consumer. Canonical handler parsing and model-facing description keep those
  consumers on the selected subagent model, with the main agent unchanged.

## Acceptance and migration

Before replacing either production entrypoint, freeze declarations, structured
outputs, diagnostic strings and source/emitted behavior in local contract fixtures.
Run direct admission/port/error/order contracts, pure resolution cases and the
actual registry, executor and CreateWorkflow/AmendWorkflow consumers in both
source and emitted modes. Record any baseline failures and correct test wiring
against observed old behavior, never weaken existing tracked tests.

The test-only `KNORVIA_MODEL_CATALOG_TEST_EMITTED=1` chooses emitted JS; it is not
product configuration. Repeat the same contracts after replacement; compare finite
generated cases with a temporary exact-base reference outside tracked sources.
Verify that CLI/TUI bundles contain the replacement, then root/CLI types and lint,
explicit strict lint on owned files, formatting and architecture. Report broader
legacy lint failures separately. No deadline increase, security bypass, shared
provenance edit or runtime fallback to inherited code is allowed.

Linux synthetic-port evidence does not establish live provider/model behavior,
native acceptance, Windows/macOS execution, desktop/Web visuals, distribution
license closure or whole-product independence. Record skipped acceptance and
stop at a clean lane checkpoint for root to integrate.

## Baseline execution record

Initial inherited source/emitted runs each passed 18/20 tests. Two new consumer
assertions assumed a raw output in Result and an unwrapped business-error model
message. The existing executor actually emits serialization/display under Result
and wraps the error in `<tool_use_error>`. Corrected local assertions produced
20/20 passing tests in each mode before replacing either entrypoint; no tracked
executor/test or timeout change was made for these fixture failures.
