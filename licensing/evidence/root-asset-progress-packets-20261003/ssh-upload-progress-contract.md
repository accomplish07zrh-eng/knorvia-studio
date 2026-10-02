# Body-free contract: SSH upload progress owner

Target: `packages/server/src/remote/sshUploadProgress.ts`.
Binding: current bytes at lane head `f276fb97eaf15974befb814f80fc16d23e6db9f8`, SHA-256 `90810512ac42c2b2a795685d5f494c3827123d1f55f9107a9787127a8fb27941`, 3825 bytes. Root must hash its current target without displaying source; mismatch requires refreshed binding. Root's reported PR12 head `17f779d2cd65b90a5d2c2effba92f386e3d2da70` is not integrated or inspected by this lane.

## Eligibility, owner and dependencies

This target has substantive implementation: async size inspection, error rendering and one closure owning progress throttle/deduplication state. It is eligible for complete functional/API authoring, without exposing source/test/history bodies. No new transport, connection, credentials, upload, permission or filesystem-write behavior belongs here.

Dependencies: `stat` from `node:fs/promises`; POSIX path basename from `node:path`; Date.now; console.log; Error, JSON.stringify and String conversion. No package/local imports. Retain exported type `SSHUploadTransport = 'sftp' | 'exec'`. Private policy constants are interval 1000 milliseconds, percentage step 5, and binary megabyte divisor 1024*1024. Private numeric status contract table: 0 OK, 1 EOF, 2 NO_SUCH_FILE, 3 PERMISSION_DENIED, 4 FAILURE, 5 BAD_MESSAGE, 6 NO_CONNECTION, 7 CONNECTION_LOST, 8 OP_UNSUPPORTED; any other numeric code is UNKNOWN. These compatibility values are retained expressions/data, not a novelty claim.

## Exported read and label APIs

`readLocalFileSize(localPath: string): Promise<number | null>`: await stat(localPath) inside its try; if result.isFile() truthy return result.size, otherwise null. Catch any stat, isFile or size-property error and return null. Async-return/rejection delivery remains standard; no pre-validation, caching, stat retries, logging or synchronous filesystem use. Directories and other file types return null. No real user paths or filesystem data are required for authoring or allowed runtime validation.

`formatSSHUploadLabel(remotePath: string): string`: synchronous POSIX basename. Do not replace with host-native basename, trim paths or redact them here. POSIX empty/root/trailing slash/backslash behavior is retained. Invalid runtime types throw Node's original synchronous error.

## Exported error rendering

`formatSSHUploadError(error: unknown): string` retains this order:

1. Only an actual `instanceof Error` receives SSH-specific interpretation. Test its optional code property's runtime type; numeric code gets the status lookup label or UNKNOWN and output `${label}(code=${code})`, with no message suffix. No integer/range/finiteness normalization. Numeric values including NaN/Infinity/negative remain interpolated as JavaScript normally renders them. Property reads occur during type check, table lookup and formatting, so do not eagerly cache a potentially effectful code getter or expand the surrounding catch scope.
2. If that Error's message is truthy, return it unchanged: no trim, rewrite, suffix or cloning. Message is read for the truthy check and again for the return. Any getter error here propagates; this branch is outside the JSON conversion catch.
3. Otherwise, a primitive string whose trimmed length is positive returns its trimmed value. Blank strings continue to JSON handling, so whitespace strings are JSON-quoted, not empty placeholders.
4. Try JSON.stringify(error) and return its result as-is. Catch only serialization failure and return String(error); errors from that String conversion can propagate. Circular values and BigInt take this fallback. Plain objects with code/message do not receive Error handling. Runtime undefined, functions and symbols can produce undefined despite the declared string return type; preserve this inherited mismatch, do not introduce a placeholder/default or widen the public type merely for textual change. Error with falsy message and nonnumeric code uses the same JSON branch.

## Exported progress reporter and state

`createSSHUploadProgressReporter(transport: SSHUploadTransport, uploadLabel: string, totalBytes: number | null): (transferredBytes: number, force: boolean) => void`.

On construction read Date.now once into startedAt. Closure state starts lastLoggedAt=0, lastLoggedPercent=0, lastLoggedTransferredBytes=-1. Each reporter owns its state independently. Transport/label/totalBytes are captured inputs; no shared/global registry or reset/dispose method.

On every invocation, BEFORE admission checks:

- Read Date.now once as now.
- Elapsed seconds is max((now-startedAt)/1000, 0.001), so negative clock movement and zero elapsed use the minimum. Speed is transferred binary MB / elapsed seconds.
- transferredMB is transferredBytes/(1024*1024). totalMB is totalBytes/(1024*1024) when totalBytes is not null/undefined, else null.
- Percent is min((transferredBytes/totalBytes)*100,100) only when totalBytes is not null/undefined AND greater than zero; else null. No lower clamp, rounding before admission, normalization or monotonic enforcement.
- byInterval checks now-lastLoggedAt >=1000; byPercent requires percent not null and percent-lastLoggedPercent >=5; reachedEnd requires percent not null and percent>=100.

Admission order:

1. Nonforced invocation returns only when ALL interval, percentage-step and end conditions are false.
2. Forced invocation returns if transferredBytes === lastLoggedTransferredBytes AND either percent is null or percent <= lastLoggedPercent. This check is forced-only and follows the previous nonforced gate.
3. Otherwise log once, then update lastLoggedAt to now and lastLoggedTransferredBytes to transferredBytes; update lastLoggedPercent only when percent is not null.

No special first-call rule. A time near zero can suppress a first unforced small update. The initial -1-byte forced unknown-total report can deduplicate against the sentinel. Same-byte repeated unforced reports reaching 100% always qualify; same-byte forced reports deduplicate if percent <= previous. Regressing percentages are allowed and become the new state when logged. NaN uses JavaScript ordinary comparisons (NaN does not satisfy percent-step/end/<= and NaN bytes do not equal themselves). Zero/negative/NaN totals yield null percent and use the unknown-total message. Infinity and undefined-at-runtime inputs receive ordinary arithmetic/null-check behavior; do not validate or correct them.

## Exact output and error/event semantics

console.log gets ONE string argument, preserving all punctuation, spaces, bracket syntax, filename label and formatting:

Known totalMB and percent (both not null):

`[ssh] upload progress [${transport}] (${uploadLabel}): ${percent.toFixed(1)}% (${transferredMB.toFixed(1)}/${totalMB.toFixed(1)} MB, ${speedMBPerSecond.toFixed(2)} MB/s)`

Otherwise:

`[ssh] upload progress [${transport}] (${uploadLabel}): ${transferredMB.toFixed(1)} MB (total unknown, ${speedMBPerSecond.toFixed(2)} MB/s)`

Rounding happens only for display. Snapshot calculation precedes admission; state update follows successful console.log. Date.now, conversion or console.log errors propagate synchronously and do not advance logged state. No asynchronous event scheduling, debounce timer, listener, retry, upload completion guarantee or transport-switch side effect is added. Logging remains console-based and uses captured label directly. Do not perform real SSH/SFTP/exec/network/server operations to validate this pure owner.

## Author boundary and validation limits

Fresh author should read only this complete body-free packet and explicitly permitted root guidance/public declarations. Root curator has not deliberately read these target bodies by parent disclosure, but generic scanners may have processed bytes; broader inherited context persists. Packet curator here read the complete bound target implementation, so source-exposure qualification applies. This packet contains no source/test/history bodies, copied comments or prior patch. Exact author input/output hashes/access declarations must accompany later implementation separately; shared workspace restrictions are not OS-enforced isolation. No independent-provenance/MIT/novelty claim follows from packet creation.

Ordinary tests/builds remain deferred. This owner has no data writes/deletion/permission action; no runtime safety test is presently justified by its contract alone. Root may request one narrowly injected synthetic check only if candidate review exposes a concrete boundary issue. All real filesystem/user data/network/credentials/remote commands are excluded.
