# Lane A contribution candidates at 20e293e

This is a bounded evidence review of the 44 production/helper/test files changed
by this fixed CLI lane: Skill, ListModels/model-reference, AskUserQuestion,
OffPeak and Cron. The assessed snapshot is immutable
`20e293e4dba5f38c940ec6112dcb34dc4eead122`. No production file, prior commit,
licensing review/report, root licence/notice or third-party inventory is changed.
Root independently reviews all candidates and owns every actual licence decision.

## Review rules and evidence design

The read-only inputs are licensing/README.md, licensing/reviews.json,
scripts/provenance/model.mjs and git.mjs, the independent-implementation and
integration-provenance specifications, root LICENSE/NOTICE/third-party notices,
the pinned upstream baseline and current provenance report. Input digests,
review schema constraints and per-file contribution facts are recorded in
`docs/evidence/knorvia-cli-tools-fast-contribution-matrix-20261001.json`.

The existing schema accepts original, independent-replacement, third-party and
reviewed-retained. It requires a path, normalized digest, nonempty licence,
basis and evidence. reviewed-retained requires NOASSERTION and either functional-
configuration or standard-license-text. None of these 44 files is assigned that
nature. This candidate matrix has its own evidence schema and is not a reviews.json
patch: no accepted review or licence grant is proposed. Each recommendation
explicitly leaves the whole-file decision unresolved; narrower new-expression
candidates are separated from retained material.

This lane inspected inherited source before replacing behavior; there were no
isolated clean-room roles. Changed hashes, line counts, new paths, function movement,
passing contracts and build results are not originality evidence. There are no
existing digest-bound reviews for these 44 paths in this snapshot. Missing rows
in the old generated report for new helpers/tests are recorded as missing, not
as original or independently licensed. The pinned publisher commit object is
absent from this lane's local object store. The six exposed-source records retain
their existing digest/blob manifest facts and `publisherBytesRechecked: false` for
this lane. Root has since supplied independent publisher-byte evidence, recorded
separately below; no new local publisher-byte or notice examination is claimed.

The matrix binds raw and CRLF-normalized file hashes, Git blobs, exact assessed
and last-change commits, per-family behavior baselines, current interface/export
facts and exposed upstream path/blob/digests. Material anchors use UTF-16 source
character offsets plus display line numbers and UTF-8 slice hashes. Exact retained
expressions have both current and baseline anchors. Other inherited prose/output
compositions and functional interface material are explicitly identified as such.
Every new structure has an inspected symbol/test anchor and a description of
its actual control, effect, projection or synthetic test expression. Imported
contracts/fixtures remain dependencies, never claimed as newly authored here.

The comparison aid finds maximal matching AST fragments with at least 16 lexical
tokens/65 characters and matching literal/template segments of at least 20
characters. These thresholds only locate evidence; absence of a match proves
nothing, and an ordinary functional match alone is not a copyright finding.
Manual material notes supplement the scan for reconstructed output prose,
retained comments, declarations, error messages and public shapes. The frozen
JSON files contain inherited declarations and old observed outputs; they are
not original test logic. Test harness control/assertion structure and fictional
inputs are reviewed separately from their inherited expected values.

## Review result and remaining work

Detailed per-file recommendations, retained material and possible future bounded
separations follow in the matrix. The checker verifies schema, scope, all digests,
Git history and fragment anchors without updating any shared provenance file.
It never contacts a publisher or runs product handlers/external ports. Its
success establishes evidence consistency only; it cannot determine authorship,
materiality, applicable rights or final MIT eligibility.

The evidence checker is the single read-only owner of validation. Its only
mutable state is a call-local cache of pinned Git blobs; it neither evaluates
handlers nor writes repository files. It uses the existing provenance fingerprint,
index/classification and safe repository-read functions. Default validation checks
the 44 actual working-tree files as well as historical inputs. Historical shared
inputs stay pinned to the assessed commit so root can later regenerate shared
provenance without rewriting this evidence. `--snapshot-only` explicitly omits
working-tree verification; its output must not be presented as current-source
verification. In-memory negative checks mutate candidate data only.
The pure candidate schema is in the narrowly named contribution-schema companion;
the checker owns all filesystem/Git effects. Executed provenance helper digests
must match the assessed versions; shared report/review regeneration alone does
not invalidate historical inputs.

Existing attribution and applicable licence boundaries remain. File-local notices
are reported exactly as found; none is added, removed or replaced with a template.
No publisher copyright owner is inferred from repository names or commit authors.
The 27 unresolved project material obligations remain unresolved and outside this
subset review. Native/live acceptance limits in the existing lane handoff also
remain; historical test evidence is cited only for behavior, not ownership.

The recommendation counts are 15 unresolved production files with retained
material, five unresolved frozen snapshots, five mixed test files, and 19 narrower
new-expression candidates requiring root review. The last group is one production
policy file and 18 test/harness files. It does not mean those files have accepted
whole-file originality or MIT status: functional interface expressions and imported
or computed inherited expectations are still explicitly qualified.

The smallest retained production boundaries are recorded with exact paired spans:

- Skill: the entry prompt/declarations, execution trace object and missing-port
  message, instruction wrapper and markers remain inherited. New transaction and
  delimiter/replacement-dollar logic are separate contribution candidates.
- Models: ListModels declarations, catalog/error prose and formatting language;
  model-reference exported interfaces, byte-retained `parseWorkflowSubagentModel`,
  description sentence and refusal guidance remain. The per-query selection policy
  is the narrower implementation candidate, with functional import/reason literals
  disclosed. Changing the description into a ternary did not create new prose.
- AskUserQuestion: declarations, comments, required-answer message, narration
  sentences and the exact `questions.filter`/`in` membership expression remain.
  The result decision and narration fold are qualified separately.
- OffPeak: the exported idle-turn guard, permission/budget/timeout constructors
  and both entries are byte-retained. Result diagnostics/success template and
  port/error fields remain compatibility material around the new plan/interpreter.
- Cron: both guards, permission/budget/timeout constructors and all four entries
  are byte-retained. The new operation/effect/completion path still includes the
  old model-context expression, confirmation language and Chinese comments.

The five mixed test files are Skill contract, ListModels contract, model-reference
contract, AskUserQuestion consumer and OffPeak consumer tests. The OffPeak consumer
expectation includes the existing SendMessage foreground-agent hint: it is not new
test prose, and its out-of-scope consumer source/rights remain for root to confirm.
All five JSON snapshots retain their parsed values from their initial capture
commits; Cron's later formatting changed bytes only. The initial comment comparison
aid missed four nested comments; AST trivia inspection corrected the evidence.
The anchor checker independently binds source slices, not semantic equivalence of
recomposed language or copyright materiality.

Possible future work is separation of explicitly retained compatibility declarations,
messages and fixtures from separately reviewed control/test expression; the matrix
identifies a bounded proposal for each file. A move alone would leave the same
retained obligation. No such production change is made here. Accurate MIT scope
for this subset still requires root to resolve retained material, bind the supplied
publisher-byte evidence and confirm applicable notices, confirm new-contribution rights and
digest-bound review scope, and verify the resulting packaged release boundary.
The 27 project obligations are a separate unresolved release gate.

## Parent publisher-byte evidence

Root reports an independent fetch of public ZCode commit
`872ad960de7ec172591f7e1952f7849229f94521` into a separate temporary bare Git
repository, with tree `d185a9a893c00d51fc3fe51fe7371b9eea7de143` checked. Root
resolved and hashed actual Skill, ListModels, model-reference, AskUserQuestion,
OffPeak and Cron publisher blobs; it reports that all path/blob IDs and
LF-normalized SHA-256 values exactly match licensing/upstream-baseline.json and
recorded metadata. Its seven-file check also included ReadSessionContext, which
is outside this lane review.

The supplied provenance reference is root commit `c60100f`, artifact
`licensing/evidence/cli-upstream-byte-verification-20261001.json`, in publication
batch `20d6ca5`, reported as not yet remotely verified. This lane records the
parent statement without reading that artifact, resolving those abbreviated
commits, contacting the publisher or claiming its own publisher-byte verification.
The matrix makes these limits explicit. The publisher bytes are now available
according to root; the local missing-object fact no longer means a global byte
availability blocker. Exact artifact/publication binding and applicable notice,
rights and retained-material decisions still belong to root. All candidate
statuses, source-exposure facts and attribution requirements remain unchanged.

## Current-file index

Production paths are under `apps/cli/packages/core/src/tool/handlers/`; test/data
paths are under `apps/cli/packages/core/test/`. The JSON records full paths, full
commits, raw/normalized hashes, Git blobs and precise material anchors. Prefixes
below are navigation aids. R = unresolved retained production material; N = narrower
new-expression candidate needing root review; T = unresolved mixed test material;
F = unresolved frozen inherited data. Every whole-file decision remains null.

| File                                  | Last change | Raw SHA-256 prefix | Status |
| ------------------------------------- | ----------- | ------------------ | ------ |
| `ask-user-question-narration.ts`      | `7d3066f`   | `9537d2eeca7b`     | R      |
| `ask-user-question-result.ts`         | `7d3066f`   | `ee633585e392`     | R      |
| `ask-user-question.ts`                | `7d3066f`   | `b4c9f1988d18`     | R      |
| `cron-execution.ts`                   | `1d519f8`   | `4cfdea8c41ac`     | R      |
| `cron.ts`                             | `1d519f8`   | `0ee5b80b04cf`     | R      |
| `list-models-projection.ts`           | `3291352`   | `92f2d8bdfd3a`     | R      |
| `list-models.ts`                      | `ba78f5e`   | `57b78a7fa81f`     | R      |
| `model-reference-diagnostics.ts`      | `85e9527`   | `4a2649104218`     | R      |
| `model-reference-policy.ts`           | `da0fa64`   | `066bc4804669`     | N      |
| `model-reference.ts`                  | `85e9527`   | `20109a528b61`     | R      |
| `off-peak-execution.ts`               | `f837f41`   | `0416949a0310`     | R      |
| `off-peak-result.ts`                  | `f837f41`   | `b39819d67c3b`     | R      |
| `off-peak.ts`                         | `f837f41`   | `d3cb1918be8f`     | R      |
| `skill-execution.ts`                  | `cbd6835`   | `001f4fc0189a`     | R      |
| `skill-instructions.ts`               | `cbd6835`   | `4c5883ab5f26`     | R      |
| `skill.ts`                            | `cbd6835`   | `b79515bbb85f`     | R      |
| `ask-user-question-consumers.test.ts` | `cde9b0c`   | `c676b531b18d`     | T      |
| `ask-user-question-contract.json`     | `cde9b0c`   | `60df0e3b528f`     | F      |
| `ask-user-question-contract.test.ts`  | `cde9b0c`   | `3b3a031bd9e5`     | N      |
| `ask-user-question-differential.mts`  | `7d3066f`   | `c878e31de18f`     | N      |
| `ask-user-question-fixture.ts`        | `cde9b0c`   | `ddff8f0858b9`     | N      |
| `cron-consumers.test.ts`              | `7d5a80e`   | `107516d45ecb`     | N      |
| `cron-contract.json`                  | `20e293e`   | `0680fd33e641`     | F      |
| `cron-contract.test.ts`               | `7d5a80e`   | `309dba5a2a5b`     | N      |
| `cron-differential.mts`               | `1d519f8`   | `bb6ca3d4320a`     | N      |
| `cron-fixture.ts`                     | `7d5a80e`   | `e430cfc6d1af`     | N      |
| `cron-protocol-fixture.ts`            | `7d5a80e`   | `a3fd6b086d4e`     | N      |
| `cron-protocol.test.ts`               | `7d5a80e`   | `c106a5da7d25`     | N      |
| `list-models-contract.test.ts`        | `3291352`   | `775d21f47fbb`     | T      |
| `model-catalog-consumers.test.ts`     | `7dc53fd`   | `dbb9b1530ebf`     | N      |
| `model-catalog-contract.json`         | `7dc53fd`   | `e0be626cabdc`     | F      |
| `model-catalog-differential.mts`      | `ba78f5e`   | `e4e60d571a4c`     | N      |
| `model-catalog-fixture.ts`            | `7dc53fd`   | `28ba59c59830`     | N      |
| `model-reference-contract.test.ts`    | `da0fa64`   | `e3b11240f19e`     | T      |
| `off-peak-consumers.test.ts`          | `b0f193b`   | `8e916b6b04cc`     | T      |
| `off-peak-contract.json`              | `b0f193b`   | `bde91975ab78`     | F      |
| `off-peak-contract.test.ts`           | `b0f193b`   | `046c52969598`     | N      |
| `off-peak-differential.mts`           | `f837f41`   | `b0f1f8360b00`     | N      |
| `off-peak-fixture.ts`                 | `b0f193b`   | `39110c608254`     | N      |
| `off-peak-protocol.test.ts`           | `b0f193b`   | `5a4f77f569d5`     | N      |
| `skill-tool-contract.json`            | `0a8b4d3`   | `f84940a79d03`     | F      |
| `skill-tool-contract.test.ts`         | `0a8b4d3`   | `7b033743e8e4`     | T      |
| `skill-tool-executor.test.ts`         | `0a8b4d3`   | `08840a2afa0b`     | N      |
| `skill-tool-fixture.ts`               | `0a8b4d3`   | `ebf3467da594`     | N      |

## Reproduction and validation

From this evidence checkpoint with the assessed provenance helpers and candidate
files available, run:

```sh
node docs/evidence/knorvia-cli-tools-fast-contribution-check-20261001.mjs --self-test
```

The default run requires byte-identical working-tree candidates and separately
verifies their historical raw/normalized digests and Git blobs. It reports the
matrix's own raw digest and checks its ordered candidate-set tuple digest.
`--snapshot-only` checks historical evidence without verifying current candidates;
that mode cannot substitute for the default current-source check. Parent evidence
is identified as a statement/reference, never a locally verified artifact.

The matrix raw SHA-256 is
`8d861d26c215383366104dcc87ec3db6ae34c8f618323308db1cfec117544f93`.
The ordered candidate-set SHA-256 is
`136b55f5d2384533aca918ba47419ed44ec79ce50a48ddb983aec21fac3fc33e`.

Actual default validation passed for 44 current candidates, 20 pinned inputs,
118 retained-material records and seven additional baseline composition-owner
anchors. Eight in-memory candidate/anchor tamper cases were rejected; four valid
review-schema probes were accepted and five invalid review-schema probes rejected.
These synthetic schema probes were never persisted as licence decisions.

Node 24.14.0 / pnpm 10.33.2 validation also passed root type checking (5,422
matching translation keys), configured root lint (2,841 files), strict owned lint
including undefined identifiers (two new MJS files), full architecture (zero
violations) and root formatting (5,880 files). The initial new-checker lint and
refactor errors were corrected and the complete checker rerun; no rule exception,
test expectation, timeout or product behavior was changed. A broader notice-text
scan found no file-local copyright/SPDX/licence header in the 44 candidates.

The requested executor availability read and actual shell/Node verification
succeeded after the disconnect notice; existing matrix work was preserved. This
checkpoint changes four lane evidence files only. Existing production/tests and
shared licensing, notices, inventories, dependencies and CI remain byte-identical
to the assessed commit. Builds and product regression were not rerun for these
evidence-only edits. Historical final-source/emitted/build/full-regression evidence
remains in the immutable lane handoff: 6,096 pass / eight skipped / zero failed,
with seven Windows/PowerShell cases and one optional Claude comparison skipped.
Native Windows/macOS/CUA, live accounts/ports/notifications, visual and packaged
acceptance are not established by this provenance checkpoint.
