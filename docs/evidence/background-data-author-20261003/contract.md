# Background result-data behavior-only contract

Implement both complete modules at logical `core/src/tool/executor/background-task-output.ts` and `workflow-artifact.ts`. The two API declarations specify all public signatures and reachable field shapes. Keep serializer import/re-export identity from @knorvia/contracts; no wrapper or dependency implementation. Private representation is author choice, no new state, framework, policy, IO, catches/retries or async boundaries. Current-task author inputs are these four files: two \*-api.d.ts, dependency-api.d.ts and this contract. No implementation/history/tests/oracles/receipts/compiled bodies or dependency implementations before complete draft save/hash. Disclose prior context/instruction-only access, no clean-room/licence/header claim.

## Output metadata

Return a new ordinary object on each call with these own keys in exact order, including when values are undefined:
childSessionId, outputBytes, outputFile, outputTail, outputTruncated, stderrBytes, stderrFile, stderrTail, stdoutBytes, stdoutFile, stdoutTail.

Source reads use an optional record and a key: falsy source or absent `key in source` yields undefined without value read; otherwise read property once. Inherited properties count. For strings/numbers/booleans require only exact typeof, not truthiness, finite checks, trimming or coercion. Record-valued properties admit any non-null typeof object, including arrays/Date, but not functions. The public snapshot is object|undefined; do not add acceptance policy for malformed primitives. Property/`in` errors propagate synchronously. Never mutate snapshot, launch, nested values or keep state.

Observable read phases (conditional fallback short-circuits):

1. Capture snapshot.result as a record. Then childSessionId from snapshot string ?? launch string. Capture result.stdout and result.stderr as records.
2. stdoutFile from snapshot.stdoutPersistedOutputPath ?? captured stdout.artifactPath ?? launch.stdoutPersistedOutputPath, all string reads. stderrFile analogous.
3. outputFile string priority snapshot.outputPath, snapshot.outputFile, snapshot.persistedOutputPath, snapshot.rawOutputPath, launch.persistedOutputPath, launch.rawOutputPath, launch.outputFile, then already-captured stdoutFile, stderrFile. These are nullish fallbacks; empty string stops later reads.
4. stdoutBytes number from captured stdout.bytes ?? snapshot.stdoutBytes; stderrBytes similarly. stdoutTail string from captured stdout.text || snapshot.stdoutTail, stderrTail similarly. Stream empty text triggers snapshot fallback, but an empty snapshot tail remains a value.
5. Capture snapshot.output as record, then its response string even when another tail already wins. outputBytes is undefined only when both byte facts undefined; otherwise sum each nullish fact with0. NaN/Infinity/negative number values are not sanitized.
6. outputTruncated is undefined when captured result is undefined; otherwise short-circuit strict boolean-true reads in order stdout.truncated,stderr.truncated,stdout.artifactTruncated,stderr.artifactTruncated, producing false when no true. Mere truthy nonboolean does not count.
7. Assemble the ordered fields. outputTail uses stdoutTail ?? stderrTail ?? workflow response; empty stdout snapshot tail suppresses stderr/workflow fallback. File/child/byte/tail references and values remain unchanged.

Consumers own session/task identity, notification publication, cancellation and actual output files. This owner only reports facts.

## Report notification text

`buildWorkflowReportsNotificationSection` returns undefined for undefined items or length0. For a nonempty report array, preserve native entries iteration and item identity/order. For each encountered item call the existing serializer exactly once with that item. Nullish serializer return becomes empty text. Clip serialized text to2000 UTF-16 characters: at length<=2000 unchanged; otherwise first1999 characters + Unicode ellipsis U+2026. Format line exactly `[{oneBasedIndex}] {text}` using the entries index+1.

The text budget is8000 charged characters. A candidate line costs line.length+1 (newline charged even after the last accepted line). Always admit the first line. For later lines, serialize/clip/construct before checking whether accumulated charge+candidate charge exceeds8000; the first rejected report is still serialized, and its serialization error propagates rather than being skipped due to known full budget. Stop immediately on rejection; do not inspect/serialize subsequent reports. Keep charged length/order, no sorting or pre-cap slicing. Native entries behavior, including sparse entries/iteration side effects, remains observable.

Return own fields `{count,shown,preview}` in that order. count is current items.length after iteration, not a startup capture; shown is accepted line count; preview joins accepted lines with newline. No extra trailing newline. Count differs from shown under truncation; no invented status/prose.

## Report manifest

`buildWorkflowReportsManifestSection` has the same undefined/length0 no-op. Preserve native values iteration and references. Serialize/clip at most8 accepted items, each at500 UTF-16 characters (first499 + U+2026 when longer). A ninth item is fetched by the native iterator before the8-item admission guard stops; it is not serialized. Consequently a native item-fetch failure there is observable and must not be silently skipped. This is an iteration/guard boundary, not permission to read further reports or to pre-slice the sequence. No text-budget check here.

Return own `{count,shown,preview}` in that order, using current items.length, accepted count and array of clipped strings. There is no ordinal prefix in manifest previews. Inputs are not mutated; serializer exceptions remain exact. The API uses a shared serializer import/re-export with identity preserved; no private competing serializer.

## Existing boundaries

Actual background-tracker-projection taskPayload and background-tracker-notification enqueueTerminalNotification consume these outputs. Their sources, native sync/async publication boundaries, enqueue policy/claim/release/receiver and user/model-facing notification prose remain unchanged. Fixture ports and report values are owned synthetic data; no live task/notification/process/artifact/provider/user-file operation. Public fixed labels, field vocabulary, character budgets and standard nullish/type/iteration operations are compatibility facts, not automatic independent-expression credit. Discretionary developer documentation should be concise original facts; do not copy predecessor narrative.
