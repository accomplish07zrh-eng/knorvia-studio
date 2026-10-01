# Repository expression review checkpoint

Evidence-only candidate dfac8018752da1c7b7f4d26f1cecb9721c23c58c. No production
change or new branch orchestration was implemented. Root's design correction
retired the proposed generator before implementation: switch/create mainly retain
fixed guards, commands and status handoff, and a generator would not establish a
substantive independent contribution. The provisional spec and two exact exposed
branch-method expressions remain as historical evidence. No new product test or
failure run occurred; existing assertions and earlier receipts are unchanged.

The [digest inventory](./knorvia-git-repository-expression-review-fast-20261001.jsonl)
records50 named declarations/methods and51 surrounding syntax/prose gaps, covering
the complete current gitCliRepo.ts. JSONL keeps one fact per line; these are
coverage/retention facts, not authorship or licence counts. All26 Git production
files, public emitted declaration bytes and five shared records/notices are
protected. The existing shared inventory's repo row still describes import-era
bytes as upstream-modified/NOASSERTION; it is recorded as historical, not treated
as a current digest or updated here.

Expression findings:

- 36 named owners exactly match the pinned publisher, local import and integrated
  baseline: preview readers/result shapes, operation markers, branch result
  builders, remote parsing/config/selection, factory provider/maps, cache cleanup/
  invalidation, branch validation/probing, switch/create, stage/unstage/discard and
  push. These mix fixed APIs/prose/standard glue with retained application control.
- Changed owners include accepted repository/status/read plans and their entry
  methods, identity, selected-index decoding and rename cleanup. Changed wrappers
  do not make the entire declaration independently authored: commit retains its
  original message/path admission, commands, temporary-index sequence, finally
  cleanup and most expression around the two replaced projections. Existing slice
  receipts remain the evidence for their contributions, not new rights decisions.
- Preview acquisition is still live. getDiff passes branch/staged/worktree readers
  and unavailable/attachment constructors into the accepted read plan. Their
  before/after reads, merge-base fallback, stat/read/binary/size failure decisions,
  all-or-nothing content pairing, explanatory comments and patch-preserving fallback
  remain inherited. Removing them as dead code would break real consumers.
- Imports, factory signature/envelope, formatting and prose outside named owners
  are separately digest-bound. Publisher declarations absent from this file include
  watch-path/branch-ref/graph helpers; absence or relocation alone proves no
  originality. Accepted graph work is not reopened. Whole-file mixed-source status
  and applicable upstream attribution remain; source exposure is disclosed without
  being treated as a permanent bar to root's later independent review.

Actual callers: gitService/git.ts preserve branch requests/results over RPC;
useGitBranchSwitcher submits switch/create requests and handles failure/no-op/
changed results. getDiff's content fields reach GitPane and GitPaneChangeCard.
No UI or service behavior changed. Prior selected-index21/21 source and strict
emitted cases across three files remain historical dfac801 evidence, not a new
run. Root's later path-scope MIT/header decision6f33fd8 is not present on this
branch; the earlier receipt and current protected path-scope bytes remain exact.

Concrete next decision: independently freeze and replace only the ordered
checkpoint-relative conflict scanner collectWorkspaceConflicts in
gitCheckpointRepo.ts (lines133–237), retaining its surrounding restore/store/
diff/helper owners. Its declaration exactly matches publisher SHA256
b77a96410caeb826c05021cd3cbc7f3be7a1caa67d72bffc936b1dab2bae8618.
This is a substantive read owner: expected-tree lookup, missing/unexpected path,
directory/symlink type checks, content hash comparison, ordered conflict output
and last-value/first-position deduplication. restoreBetweenCheckpoints calls it
before mutation, including force requests, and again against the target after
restoration. gitCheckpointService forwards through the registered checkpoint RPC
descriptor; the targeted services-test search found no dedicated scanner tests.
That is a bounded search result, not a whole-project coverage claim. A future
slice must freeze these read/error/await orders with fake tree/lstat/hash ports
and actual service/RPC conflict-return consumers; creation, restore commands,
force/security policy and real user files remain outside that read slice.
No checkpoint implementation or tests were changed in this review.

Exact publisher commit/tree, local import7619e41, integrated0d80f9c and file/blob
facts reuse the selected-index receipt's pins and are verified in the inventory.
Candidate repo blob367588d4b69940f3939024da3deac5ff5b912329 last changed in19cc9bd.
Next collector/file publisher and current digests are in its own inventory row.
Existing separate local publisher storage was read without fetch/ancestry changes.

SHA256 bindings:

| Bytes                    | SHA256                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| unchanged repo source    | a7bca47a90c958a0af9e30e75484332c50e73ac844f2758cddd07e30be3cf61a                                                                    |
| unchanged emitted JS     | 5c2f62c2d614809c709cb1e87102a1f3638572f6d2614bd1248ab6c2d703f36a                                                                    |
| unchanged public d.ts    | a6a19273740e97f89c1b0cdc88b160570d45749e6d70edbb2c39850f3f95870b                                                                    |
| current review inventory | d3750a9c06187c5113989b000f7edd5c0ed9e02482d16e3886a6c231372e1d77                                                                    |
| retired branch oracle    | 5c88b0379e9136c751c9f39796eeb1b014ff7f2cfe8a1327b59ff2c9376b1f3d                                                                    |
| review checker           | e0f481f419b01bf34fb3590aa7d6fb19e9d27b3133c26dc1c841fd42270900c2                                                                    |
| checker tests / log      | 8552cd317f4d6e5dbc6a1568cce42bcae973862e92e913baf513e70d9f208926 / ece6c238b9b0ce9e06c6405bf383316d20b0d040c47dc9e723b9894eb3fc6bcf |

Reproduce from the repository root, Node24.14.0/pnpm10.33.2:

```sh
node packages/services/test/git-repository-expression-review-fast-20261001.mjs /tmp/knorvia-services-provenance-upstream-872ad960.git
node --test --test-reporter=tap packages/services/test/git-repository-expression-review-fast-20261001.test.mjs
```

The read-only checker verifies candidate/current production, pinned local objects,
original branch spans, prior validated emitted hashes and all recorded facts;
synthetic tests pass8/8 individual cases in one file, zero failures/skips. Cases
cover complete partition, changed/added/absent declarations, ambiguous/malformed
source, omitted owners, changed retention/gap/emitted facts and wrong candidate.
Owned lint passes two files; format passes four support files plus this receipt;
architecture has zero violations; offline freshness --no-fetch passes against
cached origin/main. Raw logs/draft inventory: /tmp/knorvia-branch-transition-evidence.

No product source/emitted tests, types, full suites, root-wide gates or builds
were rerun for evidence-only additions. No native/platform/shipped/GUI acceptance,
Git mutation, provider/network, user file/data, credential or settings/security
effect occurred. Shared notices and older lane27/root26 scopes remain exact.
Root owns independent licence/contribution and aggregate acceptance decisions;
no whole-file MIT grant, clean-room or publication claim. No blocker.
