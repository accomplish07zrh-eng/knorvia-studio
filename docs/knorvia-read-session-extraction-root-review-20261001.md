# ReadSessionContext extraction checkpoint

## Bounded implementation

Baseline `31305f58f6859f4d18d1e3f5e96148d6bf508081`; frozen contracts first
committed as `6c92a62`. The root implemented a private sequential extraction plan
and a single asynchronous interpreter. The plan emits extraction requests and
folds accepted notes into one string/count instead of owning model effects and
an array of extracted notes. The existing handler still owns persisted-history
reads, fallback/output projection and the model/trace/abort boundary.

This is an orchestration replacement, not a whole-handler or whole-project
independent-implementation claim. Nine retained declaration/function nodes are
byte-identical to baseline, including model prompts and invocation context.
The history material builder is unchanged. The handler falls from 440 to 369
physical lines; the private helper has 83. Line counts do not prove originality.
No user sessions, model accounts, native processes or network calls were used.

## Verification

- Frozen original source: 19/19; frozen original emitted JavaScript: 19/19
- Replacement source: 19/19; replacement emitted JavaScript: 19/19
- Differential: 4,096 synthetic cases per mode, seed 1381188440, identical result
  and ordered model-request observations; SHA256
  `2c03e7d7d2ac4465dd1db6601d1b8c054f25db565e35cc4d77ba682887bfd357`
- CLI package build: 17/17; root and serial CLI package typechecks passed
- Configured root/CLI lint and explicit owned-file lint passed
- Repository formatting and changed architecture checks passed
- Broader core lint remains failing: 23 pre-existing max-lines errors and 11
  warnings. The prior ReadSessionContext max-lines error is removed; no lint
  rule or baseline was relaxed
- Full regression: 6,577 tests, 6,511 passed, 59 existing listen EPERM failures,
  7 skips, zero cancelled. Failure-event multisets exactly match the Cron root
  baseline; no new failure or skip was hidden

The public handler is tested with synthetic store/model ports, including receiver
identity, trace metadata, signal forwarding, validation order, missing sessions,
store/model failures, aborted failures, local/fallback output, budgets and the
80,000-character boundary, five-chunk snapshot, sequential effects, marker
filtering, synthesis, model removal and post-await header behavior. A consumer
case invokes the actual material builder with owned empty history. These are
not native UI or real persisted-user-data upgrade tests.

## Reproduction

Run tests with Node's `--experimental-test-module-mocks --import tsx --test`
against `apps/cli/packages/core/test/read-session-extraction.test.ts`, using
`TSX_TSCONFIG_PATH=packages/ui/tsconfig.json`. For actual emitted imports, first
build the CLI packages and additionally set
`KNORVIA_SESSION_EXTRACTION_TARGET=dist`. This selector is test-only.

The differential runner is
`apps/cli/packages/core/test/read-session-extraction-differential.mts` and accepts
an external baseline runner path. Materialize `extractWithLite` and
`formatChunkForLite` from the above Git baseline outside the checkout, transpile
TypeScript to ESM, export `extractWithLite`, retain the baseline constants
(default tokens 6000, input budget 80000, chunk cap 5 and case-insensitive empty
marker), and route `generateLiteExtraction(input)` to
`input.context.extract(input)`. This isolates the orchestration being compared;
unchanged model logic is covered separately by the public-handler contracts.
No baseline source copy is added to shipped code. The root retained its generated
runner outside Git and executed both selector modes without changing it.

## Source and release status

Source exposure is explicit. Existing tool metadata, prompts, error strings and
output formatting remain inherited; the new helper also preserves functional
labels/formats. The tests contain frozen inherited expectations. No licence
header, attribution, shared review status or third-party inventory was changed.
Retain applicable notices and all 27 open material obligations. Source/hash
receipts bind this checkpoint but do not establish clean-room authorship or
final whole-file MIT eligibility. Native, live-provider and data-upgrade
acceptance remain open.
