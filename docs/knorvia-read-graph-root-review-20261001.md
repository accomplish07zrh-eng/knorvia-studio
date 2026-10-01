# Read orchestration and Git graph: root integration review

Publication baseline is `a899afad2bb10ede36f9789a0bed717370680402`.
CI225 passed on Linux and Windows, with 7,109 cases each and zero failures.
Its exact jobs, merge/tree binding and retained skips are in
`licensing/evidence/direct-root-ci225.json`. That CI does not cover this batch.

## Read completion settlement

Original commits `dc41e94`, `7125e4e`, `613c250` were imported as `adf41c7`,
`9cb78dd`, `373934f`. The original 31 source and 31 strict emitted tests passed,
but independent review found a supported cancellation regression. A synchronous
metadata callback can queue cancellation after a completed read. Through the
unchanged deadline owner (depth two) and complete call runner (depth three), the
baseline returns successful text or file_unchanged with metadata and Completed
telemetry. The first replacement returns tool_cancelled and Cancelled telemetry.
Both cache hits and misses are affected; early-cancel controls still cancel.

Root committed four source/emitted failing regression tests in `3cdb9b7`, then
corrected the implementation in `aa27c4a`. The private synchronous operation
generator decides stat/range effects; the original handler executes its original
awaits and owns final settlement and outer error conversion. There is no extra
await after metadata commit. Lower readers, permission, media, registry, executor
and state owners retain their existing behavior and single ownership.

Independent pinned Node 24.14.0 review confirmed all four new tests pass on the
unchanged `db8968d` baseline, all 35 source and 35 actual emitted tests pass after
the fix, and 156 error/thenable/cancellation comparisons per mode match baseline.
The original full deadline/call-runner probes now match too. Public read.d.ts
remains byte-identical, SHA256
`bb9ad163b19a8259f2f0a4e3dee53055c142d8b20e32385e364f63abad74bfc0`.

The original unmodified receipt checker passed in a detached `613c250` checkout
without `--emitted` or `--logs`. It is not represented as passing against this
corrected integrated root. Seven original owned test/fixture/golden files match;
read.ts, its private helper and the spec intentionally differ. Eighteen of 21
original emitted digests match; read.js and the helper's JS/declaration changed.
At source head aa27c4a, six protected shared-input differences all match the
preintegration a899afa root:
notices, ReadSessionContext, TaskOutput Bash and projection, current-files and
reviews. The later final current-files regeneration records this batch and is
not included in that historical equality. Original lane receipt/history remain unchanged.

Root independently fetched pinned publisher Read blob
`397c1d6fdb8bbf1119fb1debfdafd8d514b1c265`, 17,203 bytes, SHA256
`d3cebd63754aa4753832a1ab78d43ee3c8c00ce452972ebce2e24e1b81fa3712`.
Source exposure and retained syntax/prose are explicit; this is not clean-room.

## Git graph query and projection

Original `aa74802`, `7d03ea5`, `13186d4` were imported as `e11a8b4`, `cca50be`,
`ad02e94`. Root passed 435 source and 435 strict emitted related graph/Git/generator
cases, one more than the producer because root retains its canonical path test.
Eight owned files, 24 protected production files, 42 unrelated routine bodies,
three retained bodies and the producer payload digest match. Five shared/history
differences at source head aa27c4a match a899afa: notices, current-files, reviews, third-party inventory
and the CI222-fixed consumer assertion. All seven final emitted digests match the
producer, including public declarations and the desktop Host bundle.

Independent review found no supported regression across 45,441 record/query
comparisons, four paired throw/reject scenarios and 64 paired outcome scenarios.
The actual 147-case source consumer suite also passed on Node 24.19.0; root gates
use pinned Node 24.14.0. Argument arrays, normalization, lookahead pagination,
record coercion/delimiters, ref ordering/deduplication and failure propagation
remain compatible. No actual Git mutation or real repository acceptance is claimed.

Root independently fetched pinned publisher gitCliRepo blob
`ffe734dd7fcccc15c1128f7be818ea8b41c4fd90`, 58,787 bytes, SHA256
`474a377eaf9b4420e671b67ed0d9d509b66fef22151b2085b9f5d8847bec92ba`.
The unrelated repo implementation and source-exposed compatibility remain retained.

## Final gates and limitations

On corrected production head `aa27c4a`, root types, configured root/CLI lint,
owned lint, formatting, architecture and the 17-package CLI build pass. An earlier
desktop renderer build ended with SIGKILL after main/Host stages; its cause is not
established. The final serial build:no-runtime-assets on corrected source passed
main, preload, Host, scheduler and renderer stages. Runtime-asset preparation was
excluded; this is not an installer or packaged-runtime acceptance.
The failure is retained, not retroactively relabeled as a pass.

The final aggregate run records 7,291 cases: 7,225 pass, 59 fail, seven skip and
zero cancelled. The exact 59 failure-name multiset equals the preceding launcher
run's local socket-listen EPERM limitation. This is not a green local full run.
The paired machine receipt retains log hashes, corrected source/emitted digests
and comparison scopes. New exact remote CI remains necessary after publication.

Twenty-six original-material obligations remain. Notices and historical receipts
are retained; partial rewrites do not establish whole-file or whole-project MIT
rights. UI B6 onward is still unintegrated under the existing access restriction.
Native Windows/macOS GUI, installers, live providers and full real-data migration
remain outside this evidence. No merge, release, deployment, credentials, user
data, security settings or test-policy relaxation occurred.
