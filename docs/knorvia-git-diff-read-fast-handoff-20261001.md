# Diff read-query checkpoint

Original commits:a1ed03995fe440ec2d6cb59e6d9dd6b44f3a19a1 freezes the spec/contracts;
ef868b0eb58eaa017d1ef96f34e51cdd1588d488 implements getDiff and private
gitDiffReadPlan.ts. First checkpointa115bbe and all earlier receipts stay intact.
This appended receipt/checker changes no production. The sibling record seals
eight source/spec/test/oracle paths and four emitted artifacts at ef868b0.

The original getDiff body SHA256
`87352f5eb23e043b64cafca2947b999427f414112e5c149ed0e524ccd3411f79`
equals publisher872ad960/tree d185a9, import7619e41, integrated0d80f9c and
a115bbe. Exact publisher/local file digests and blob/commit facts are recorded;
the new private helper path is absent from that publisher tree. Existing separately
stored publisher bytes were read only. No production ancestry changed.

One per-call source variant drives incremental argv assembly and one common
diff-command/classification point, then selects content reads or the ordered
existence/text/no-index fallback. Lazy yielded operations retain receiver-before-
argument evaluation; the existing entrypoint owns each original await. There is
no extra orchestration promise or new cache/state/retry owner. This substantive
selection/assembly/control expression is offered for independent review under
the existing MIT acceptance criteria, not attributed originality based on a move,
changed hash, test result or file count. Source exposure is disclosed, not treated
as an automatic permanent bar to a future supported contribution decision.

Public method signature and all public declarations are exact. Native path/
getter expressions, fixed protocol tokens/limits/options, errors and the no-index
tuple are retained compatibility material. Selected exact spans use UTF-16
half-open offset pairs. All surrounding repo bodies/state/maps/reuse/invalidation,
content readers (including prior preview safeguards), classifier/parsers/plans,
service/projector/generator/scope/provider/config and shared Git files stay exact.
The checker masks only getDiff's body, new helper import and three now-unused
imports, with no whitespace normalization. The ten-declaration test oracle is
copied exposed local baseline: only getDiff is publisher-identity verified; nine
private declarations include earlier local corrections. Its historical
inheritedTestOnly flag does not prove all ten are publisher-identical. No
unaudited whole-file MIT, clean-room, licence or native-acceptance grant; applicable
LICENSE/notices and shared records remain authoritative.

Before production: **97/97 source and97/97 strict emitted**,3 files each:
70 read-query/receiver/service/RPC cases,26 settlement cases containing86 baseline
comparisons per mode, and one requested future staged-only selected-rename service
case. That case uses fake Git and temp-index ports exclusively; it asserts original
rename cleanup, exact scope/argv/order/env, summary refresh and final temp cleanup.
Mutation implementation and actual repositories/files remain untouched.

Initial logs retain a stopped synthetic-gate deadlock and a complete96pass/1fail
run whose new rename expectation omitted the service summary/refresh. Both were
corrected before the97-case freeze. Three new test-style lint warnings were then
fixed without changing any assertion call; freeze and final test hashes remain
separate. The new audit's first offset replay used object fields on compact pairs;
its reader was corrected, not the sealed facts or production. No product regression,
intentional legacy correction, relaxed assertions/budgets or hidden native failure.

Final **178/178 source and178/178 strict emitted**,6 files each: new97 plus the
prior76 classifier/GitPane cases and five existing generation callers. Actual
owners match queued/reentrant same/different keys, rejected cleanup, invalidation,
late outcomes, effect counts and visible settlement order. Root types/i18n5422,
configured lint2944 files, owned lint6, format8 and changed/full architecture pass.
Evidence checker lint/format, current/historical replay and three resealed
tampered/omitted/misbound rejection probes also pass. Public gitCliRepo.d.ts stays
SHA256 `a6a19273740e97f89c1b0cdc88b160570d45749e6d70edbb2c39850f3f95870b`.

Exact source/strict-emitted commands and gate log hashes are in the sibling
record; Node24.14.0/pnpm10.33.2 and concurrency2 are unchanged. Replay:

```sh
export PATH=/tmp/node-v24.14.0-linux-x64/bin:/tmp/knorvia-tool-bin:$PATH COREPACK_HOME=/tmp/knorvia-corepack
node packages/services/test/git-diff-read-audit-fast-20261001.mjs docs/knorvia-git-diff-read-fast-evidence-20261001.json --current
node packages/services/test/git-record-parser-audit-fast-20261001.mjs docs/knorvia-git-diff-result-fast-evidence-20261001.json
```

**Full regression and full CLI/desktop builds were not run**, per user cadence;
root owns aggregate integration/publication gates. Linux synthetic acceptance
does not certify native Git, Windows/macOS, mounted GUI, shipped or separate/
remote Host acceptance. No network/provider/billing/user-data/credential/settings/
security changes. CLI/Creation/shared licensing/inventory/notices/dependencies/CI
and older27 registers are unchanged; root-reported26 obligations are separate.
No publication claim. Payload seal:
`012a576d78c6148b975f887ec235225225c89bc8ba36582a616f609f040fdce2`.
