# WebFetch orchestration: root integration review

Publication baseline is c9c556636aeda1354d7a030ec61025a8f2dc9007. Its Read/graph
correction batch is distinct from this WebFetch checkpoint. The original lane
commits 25f8ec5, f67474e, c63eedf and d6214b9 were imported without source changes
as 1b0bce5, 7c5705e, bfa358f and 81e0f22.

## Scope and independent acceptance

The entrypoint binds one async operation directly. Its original URL cache key,
schema/clock/normalization order, fresh continuation, synchronous cached admission,
cache insertion before processing, repeated status reads, result property order,
terminal formatting, metadata and public declarations are preserved. Existing
HTTP/model/egress/URL/cache/processing/error/trace and permission owners are
unchanged. This does not reproduce the separately corrected Read wrapper defect.

Root passed 29 source and 29 actual strict emitted tests, including the producer's
170 completion-edge comparisons per mode. All 13 owned source/test/spec digests
and all 26 fresh emitted artifact digests match the producer receipt. The original
unmodified receipt checker passed in a detached d6214b9 checkout without --emitted
or --logs; it is not claimed to pass on the differing integrated root.

Ten protected-input differences all match preintegration c9c5566 exactly:
THIRD-PARTY-NOTICES, ReadSessionContext, Read orchestration helper and entrypoint,
TaskOutput Bash and projection, current-files, reviews, test-studio launcher and
the Read orchestration spec. Original receipts remain historical and unchanged.
The later inventory regeneration is outside this source-head equality.

Independent read-only review verified 13 owned tuples, 219 protected inputs,
27 unchanged producer lint inputs, four retained regions and all 16 allowed paths.
It additionally passed 805 exact-baseline comparisons in each source/emitted mode:
189 controls and 616 cancellation edges, through 63 direct, 371 actual deadline
and 371 actual full call-runner invocations. HTTP/model/event/artifact thenables
cover synchronous and queued fulfillment/rejection, throwing then getter/call,
resolve-then-reject/throw, double resolution and noncallable then. Abort depth is
zero through ten. Both modes have 203 expected successes and 602 intentional
errors/cancellations, no mismatches, and observation SHA256
910954fe022151250a57b2f52ac5dba30eb2d8027b88988546492a22b682635f.
Controls assert actual thenable exercise, bound receivers, cache effects and trace
propagation, so equality is not merely two unexercised paths. All inputs are
synthetic and live fetch/DNS are fail-closed in the fixture.

Root independently acquired the exact pinned ZCode publisher WebFetch source at
872ad960de7ec172591f7e1952f7849229f94521: blob
e0a52aa30d836164f34f6f117d581cdf196cdb2e, 8,309 bytes, SHA256
fe1ec1299440e2b7b65f862ec5707e523b5c7817483c4632d0c2f87bfaa7bdf6.
This fresh byte verification supplements the producer's manifest-only statement.
It is not a licence clearance. Public prose, compatibility expressions and the
exact source/compiled baseline archive remain source-exposed retained material.

## Environment recovery and evidence boundaries

The root cloud environment restarted before this batch. The preceding committed
Read/graph head and tree were recovered exactly from its pre-uploaded Git bundle;
old temporary raw logs and native probe binaries were not recovered. Their
committed hash receipts remain historical evidence, not newly executed checks.
This WebFetch batch was built and tested anew using Node 24.14.0, pnpm 10.33.2,
frozen dependencies and a fresh 17-task CLI build with zero cache hits.

The optional Claude differential baseline was reconstructed locally from exact
commit 34fb23e5f5c610bd7379096d3f281f4bff79b71f. Eight source files match that
commit; TypeScript 6.0.2 emitted only into its disposable tree. The differential
passed 575 observations and five declaration ASTs, and the same OLD_ROOT is used
by the full run so the previously exercised comparison is not silently skipped.

## Final gates and limits

Root and CLI types, configured root/CLI lint, ten-file owned lint, formatting,
architecture and all 17 CLI build tasks pass. The serial desktop
build:no-runtime-assets passes main/preload/Host/scheduler/renderer; runtime-asset
preparation remains excluded. Final aggregate: 7,320 cases, 7,254 pass, 59 fail,
seven skip, zero cancelled. The exact failure-event multiset matches the preceding
Read/graph receipt: 58 detailed local listen EPERM failures plus their failed
parent. This is not a green local full run. The paired machine receipt retains
source/emitted bindings, independent probe summaries and new log hashes.
The upstream CI226 Windows first attempt failed before tests during unchanged
CUA artifact download with HTTP504; a single exact-job rerun was requested. That
external verification attempt is separate from this WebFetch implementation.

No live HTTP/DNS/model/account/provider/user-data operation, native Windows/macOS
GUI, installer or packaged-runtime acceptance is claimed. Source exposure and
notices remain explicit; 26 original-material obligations are still open. The
producer's older 27-item register is historical. UI B6 onward remains outside root
integration under the existing access boundary. No merge, release, deployment,
security setting, permission, retry policy or test-budget change is included.
