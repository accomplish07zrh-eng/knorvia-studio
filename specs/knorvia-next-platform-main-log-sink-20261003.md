# Native main-process diagnostic sink

Continue the same native branch/PR after
`2dadc42e566e3bc13abebd82700b48195e4dfd0b`. Select only
`packages/desktop/src/main/logger.ts`: the current source matches the recorded
upstream-modified digest, with no matching installed replacement/HOLD surfaced
in the bounded receipt/review search. Keep existing shared timestamp/redaction
and services config-directory/fault-injection APIs and the newly installed
retention owner. No shared, services, Host, renderer or UI source is edited.
Same source-exposed agent curates/authors the whole prepared-record/sink owner;
no independent-origin, contribution/rights or MIT acceptance.

```mermaid
sequenceDiagram
  participant Import as Module startup
  participant Sink as Main log sink owner
  participant Native as Existing native ports
  Import->>Sink: initialize directory and retention
  Sink->>Native: mkdirSync then cleanupExpiredLogFiles
  Sink->>Native: warn about failed deletions, if any
  Sink->>Native: stdout/stderr error listeners, same handler
  Note over Sink: Startup failures escape before later phases
  Sink->>Sink: capture date, timestamp, pid, redacted values and line
  Sink->>Native: resolve live directory then mkdirSync
  Sink->>Sink: local-date file path
  Sink->>Native: extracted console function
  Sink->>Native: fault injection then appendFileSync
  Note over Sink: Console EPIPE continues; append errors are swallowed
```

Keep exported `logger` object methods/rest-argument shapes: debug/info/warn/error
write source main; fromRenderer(level,args) spreads that array into the same
writer with source renderer. Private LogLevel remains debug/info/warn/error.
No levels, validation, binding requirements, asynchronous writes, queues,
subscriptions, replacement/redaction algorithm or new error policies.

Directory selection is live on every write: when KNORVIA_ENV exactly test,
trim KNORVIA_E2E_RUNTIME_LOG_DIR and use a truthy result; otherwise (or absent/
blank override) join getAppConfigDir() with logs. At import select once, mkdir
with recursive:true, call cleanupExpiredLogFiles with only that directory, then
if failedFiles.length>0 output warn with the exact existing retention prefix,
directory, failedFiles reference and retentionDays=14 prose. Only after warning
register stdout.on(error,handler), then stderr.on(error,sameHandler). Startup
mkdir/cleanup/non-EPIPE console errors propagate. No repeated cleanup on writes.

For each admitted write construct new Date; call formatTimestamp(date); read
process.pid; map every argument through redactDiagnosticValue(arg) with exactly
one argument; map strings unchanged and other safe values through JSON.stringify;
join with one space. Preserve undefined/JSON native behavior, references and
error order. Prepare exact `[timestamp] [level] [pid:pid] [source] message\n`.
Then re-resolve directory, mkdirSync recursively, compute daily file name from
the same Date's live getFullYear/getMonth/getDate (month/day two-character zero
padding), and join directory with YYYY-MM-DD.log. Preparation/date/config/mkdir/
join failures propagate before console and append; no fallback path.

Extract console.error for error, console.warn for warn, console.log otherwise,
before the try; call unbound with exact `[timestamp] [pid:pid] [source]` plus
redacted values. Catch only object/non-null/has-code/strict code===EPIPE errors;
all other errors propagate and stop append. The shared stdout/stderr handler
uses the same predicate, accepts non-Error objects with that code, and rethrows
all other original values. No listeners for other streams/events and no teardown.

After console, inside a separate try call maybeThrowInjectedFsFault with the
fresh `{operation:'appendFile',path:filePath}`, then appendFileSync(path,line).
Swallow errors from either operation. Preserve this injection point, console
before file, write encoding defaults and line/file compatibility. Debug checks
live NODE_ENV on every call and skips all write phases only when exactly
production; info/warn/error and fromRenderer (including debug) always write.

Author four supplied-native-port scenarios for module startup/failed retention,
live directory/line/redaction, debug versus renderer admission, EPIPE/file/error
priority and shared stream handler behavior. The fake fs ports also consume the
actual retained retention candidate; no real file or stream is used. Freeze the
whole draft and public dependency bytes before source diff. All tests/checks
remain unrun: no lint/types/build/format/architecture/audit, application, native
IO, real configuration/user data/credentials or local-computer operation.
Preserve all licence/source records; final integration owns acceptance/review.
