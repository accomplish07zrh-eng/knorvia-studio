# Session material selection root review

Baseline: `20d6ca5987f5bcb8cb1caacbcac759b25b9eb452`. Frozen public-builder
observations were committed as `3398a70` before production edits.

## Implemented boundary

A private pure selection module now owns compiled query terms, saturating
non-overlapping occurrence scoring, positional ranking and half-open chunk
ranges. The material builder uses those results while retaining existing part
projection, transcript/reference formatting and persisted-history filtering.
The occurrence scan stops once the existing score cap is reached; this does not
change the relevance policy. Handoff tail selection, relevant budget overshoot,
top-four-plus-last chunk selection and output order remain compatible.

The builder is 270 physical lines and the helper 129, versus the old builder's 379. This is a bounded orchestration/algorithm replacement, not a whole-file
independence claim or a line-count-based completion claim. There are no new IO
ports, dependencies, migrations, public tools or data stores.

## Verification

- Frozen source and built JavaScript: four test cases per mode, including 420
  exact public-builder observations in one test
- Final source and actual emitted mode: same four cases and 420 observations
- Additional generated differential: 1,024 cases per mode, seed 1296127052;
  exact outputs and input non-mutation match the external baseline builder
- Differential digest in both modes:
  `2ce3dfe947e81d12877b0f41f6657a4458ff15bc1e36138658aa9b80a715f430`
- Existing ReadSessionContext extraction consumer: 19 source + 19 emitted pass
- Root and serial CLI typechecks, all 17 CLI build tasks, configured/owned lint,
  formatting and changed architecture checks pass
- Full regression: 6,581 tests; 6,515 passed; 59 unchanged listen EPERM
  failures; 7 skips; zero cancellations. Exact failure-event multiset equals
  the prior root extraction run, with no new failure or skip

The initial frozen filtering test accidentally matched the fixture directory
word `synthetic` instead of only the excluded body text. It failed on the old
implementation; the fixture now uses a distinctive excluded-body marker. No
production logic or frozen 420-case observations were changed to make it pass.
The original failing test log is retained separately.

Actual test data is synthetic. Cases cover English/path/Han and supplementary
Han terms, repeated words, phrase matching, budgets/defaults/non-finite inputs,
empty content, ignored/model-only/synthetic/duplicate parts, long histories,
chunking, references and output projection. Public malformed-input policy,
real persisted-data migrations and native UI acceptance are outside this pure
selection checkpoint; existing public schemas and history logic are unchanged.

## Reproduction and boundaries

Use Node `--import tsx --test` with
`apps/cli/packages/core/test/session-material-contract.test.ts`. Build first
and set `KNORVIA_SESSION_MATERIAL_TARGET=dist` for actual emitted imports.
The test-only selector does not affect the product. Run the generated differential
script `session-material-differential.mts` with an external baseline module path.
Root materialized the exact baseline file through `git show` and esbuild into a
temporary module outside the checkout, resolving its unchanged dependencies from
the current core source directory. The same baseline module was used for both
source and emitted comparisons. No inherited source snapshot is shipped.

Ten retained declaration/function bodies and three branch/part utility modules
were independently byte-compared to baseline. Their hashes bind the evidence;
they are not newly authored merely because the surrounding pipeline changed.
Existing public formats, matching constants and token rules remain inherited
or contract-required expressions. Source exposure and frozen expectations are
explicit. Preserve applicable licences/notices and all 27 material obligations;
no clean-room or final whole-file MIT claim is made.
