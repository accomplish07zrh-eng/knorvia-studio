# Fixed CLI lane WebSearch handoff

## Baseline and scope

Continue from `8813066819ba9b8862d589da9b7b86f0ca4497f0` on
`parallel/cli-tools-fast-20261001`. Own only the three WebSearch handlers,
narrow WebSearch private helpers/tests, specs/knorvia-websearch-execution.md
and this handoff. Prior handlers, evidence, ReadSessionContext/session selection,
other lanes, shared licensing/inventory, package/lock/CI/security are untouched.
No release, merge, deployment, live search/model/billing/notification or user-data
access. Root integrates and decides licences. No new conversation or agents.

All three targets began inherited, upstream-modified, unreviewed, with no
changes since the assigned integrated base. The spec records exact baseline
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

Frozen checkpoint: `8aa66c7`; the captured JSON SHA-256 is
`f2f9598d783463d237d8e1a48d22ec311563534ee409216cfe8dd912c0bc46ca`.
Additional protocol checkpoint `cf356e3` observes five raw non-iterable returns,
synchronous iterables and uncoerced unknown event tags on the unchanged source
reference and actual old dist. These two tests passed before correcting the
draft replacement's native non-iterable TypeError text. The frozen JSON was not
regenerated. Final suites contain 23 named tests per source/emitted mode.

## Replacement and retained material

Implementation commit `4192a62a84afe8c6ff724d25d69eccaa40e13a55` changes the three
entrypoints and adds websearch-execution.ts, websearch-response-tree.ts and the
seeded differential script. SearchInvocation is the sole call-local request and
stream owner. Its admission decision precedes request construction and its model
effect uses the existing invocation wrapper; one transition table replaces the
stream switch without tag coercion. Its awaited private fold preserves the old
completion boundary and `input.events` native error expression. No extra model
call, collector, retry, status sink, result cache or provider choice is introduced.

One ordered traversal applies separate result/source leaf policies, replacing
the two recursive implementations. Content-before-sources, leaf precedence and
array methods/receivers/getters/holes remain observable. A single first-winner
URL projection preserves original filter semantics. The formatter assembles
paragraphs/links rather than incrementally writing line state. The trace helper
projects ordered context fields before the unchanged attributes. Helpers depend
on existing contracts/results; the results helper never imports the entrypoint
or execution helper, so no reverse or circular edge is introduced.

These files contain retained expressions; none is represented as wholly original:

| Path under core/src/tool/handlers | Actual retained material                                                                                                                                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| websearch.ts                      | Public ToolEntry/schema/metadata/declarations, local month/year getter, English month names, model-facing description strings and inherited comments.                                                                                     |
| websearch-execution.ts            | Exact system/query/native descriptions and error prose; native schema, quota/domain/context/trace fields and auxiliary-options expressions; inherited provider comments. Admission, intent and transition ownership are newly structured. |
| websearch-results.ts              | Public signatures, output object/usage predicate, source assembly and mapping expressions, Markdown regex/extraction/image exclusion/comment and formatter headings/reminder.                                                             |
| websearch-response-tree.ts        | Nonempty-string predicate, leaf shapes/type checks/precedence, flatMap recursion and lowercase/filter subexpressions retained at the raw boundary. The policy traversal and shared first-winner projection are newly structured.          |
| websearch-support.ts              | Public trace signature, field names/order and tool attributes; field projection is newly structured.                                                                                                                                      |

Frozen JSON/assertions include inherited prompts, output/declaration/error prose
and observations. New synthetic harness/control expressions and fictional inputs
are distinguished from those retained bytes. Source exposure applies to all
implementation/test work. Existing attribution and inherited prose remain;
changed structure, digests or passing tests establish no whole-file originality,
clean-room provenance or final MIT eligibility. No shared inventory/licence
decision is made. Root owns review of this mixed material and all 27 obligations.

## Final validation

The machine-readable receipt is
[knorvia-websearch-fast-checks-20261001.json](evidence/knorvia-websearch-fast-checks-20261001.json).
It binds 14 spec/production/test files to exact commits, Git blobs and raw/LF
SHA-256 digests. Prior handlers/evidence and every out-of-scope tracked path are
unchanged from `8813066`.

- Source and rebuilt actual emitted suites: 23 passed each, zero failures/skips.
- Seed `0x57534231`: 4,096 stream plus 4,096 projection comparisons in each mode
  (16,384 comparisons total), with complete trace/receiver/iteration observations.
  Expected observation SHA-256 is
  `ac1501eb25c3859db4d215b8c9042581f31ebf9d27f87a3c1b3169adf3eef0a0` in both.
  JSON observation omits undefined; separate contracts check own undefined keys,
  identities, read order and dynamic executor span presence/exact propagation.
- `pnpm build:cli-packages`: 17/17 tasks passed, ten cached. Existing debug chunk
  size and CLI/TUI dynamic-import-option warnings remain. Windows Cua driver
  staging was skipped on this Linux host.
- Root `pnpm typecheck` passed, including 5,422 matching i18n keys; CLI recursive
  typecheck passed, including core.
- Root configured lint passed on 2,841 files; CLI configured lint passed on 97.
  Owned lint actually examined all twelve TS/MTS source/test files with 94 rules,
  zero errors/warnings. The temporary policy only removed existing ignore globs.
- Broader configured core lint fails: 24 errors/11 warnings across 27 unowned
  files, each verified byte-identical to `8813066`; exact paths/digests are in
  the receipt. No rules, exclusions, baselines or unrelated files were changed.
- Root formatting passed on 5,892 files. Changed/full architecture passed with
  zero new or baseline violations; no managed module was added.

Full offline regression passed on final corrected production source: 6,127 tests
across 513 files, 6,119 passed, eight skipped, zero failed/cancelled; duration
345,577.449ms. Existing 120,000ms per-test timeout and concurrency two stayed fixed.
The eight existing skips are seven Windows/PowerShell acceptance cases and one
optional Claude leaf comparison without its old-root reference. No timeout or
skip policy was changed.

Native Windows/macOS, GUI acceptance and live provider/search/model/billing/account
acceptance were not executed. Every model/provider/clock/interaction in owned
tests is synthetic; supported adapter transformation is pure contract conversion,
never a provider runner. No real network query, user data or account was used.

## Reproduce

Use the pinned Node 24.14.0 / pnpm 10.33.2 toolchain. Build actual dist first, then
run the four `websearch-*.test.ts` files with `node --import tsx --test`; repeat
with `KNORVIA_WEBSEARCH_TEST_EMITTED=1`. This variable is a test-only source/dist
selector, not production configuration. The spec defines that boundary.

For the differential script, prepare a temporary ESM reference from exactly
`8813066` using read-only `git show` for websearch.ts, websearch-results.ts and
websearch-support.ts. Write a temporary package.json with `{"type":"module"}`.
Remap only imports: @knorvia/contracts to the current contracts dist file URL,
auxiliary-model-options to its unchanged current source file URL, and the two
local WebSearch imports from .js to .ts. Keep all reference bodies unchanged.
This ESM marker is necessary to share invocation-context storage: an initial
CJS-loaded reference failed trace identity and was corrected, without removing
or normalizing trace assertions. No inherited body is checked into new production.

Run `node --import tsx apps/cli/packages/core/test/websearch-differential.mts
<temporary-reference-directory>` in each source/emitted mode; both produce the
observation digest above. The committed script uses portable path/file URL APIs.

To verify the digest receipt from the repository root:

```js
// node --input-type=module; all operations below are read-only.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const git = promisify(execFile);
const receipt = JSON.parse(
  await readFile("docs/evidence/knorvia-websearch-fast-checks-20261001.json", "utf8"),
);
for (const file of receipt.fileDigests) {
  const bytes = await readFile(file.path);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
  const { stdout } = await git("git", ["rev-parse", `${file.commit}:${file.path}`]);
  assert.equal(stdout.trim(), file.gitBlob);
}
```
