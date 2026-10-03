# Native supervisor control transport

This lane starts at `3b1ff0f715a43cbc51c576fd524479a08e58e203` on
`rewrite/native-20261003`. Only the three runtime owners under
`packages/server-cli/src/ipc/{framing,controlClient,controlServer}.ts` are selected.
The exact baseline blobs still match the recorded renamed upstream files. A
bounded exact-path receipt search found no accepted replacement for these owners;
absence of a public receipt does not establish rights or exclude private history.

The older ChannelClient packet is superseded by the inherited PR9 candidates.
The current RPC request, framing, routing and interception owners are retained;
they are not credited to this lane. Shared schemas, ControlRequestError, Supervisor,
data-root locks, services, Host leases and business state remain existing owners.
No protocol, persisted-data, permission or product policy change is intended.

## Ownership and implementation decision

Implement a complete per-request client exchange, a complete per-socket server
session and a listener resource owner. Decode each appended batch with a cursor,
committing consumed prefixes before parsing so failures retain the same unread
suffix. This is a whole implementation from the observations below, not a rename
or extraction of predecessor helpers. The same agent read the predecessor to
curate this contract; this is not a fresh-author, clean-room or isolated-access
claim. Freeze the new whole files before reviewing their source diff.

```mermaid
sequenceDiagram
  participant Caller
  participant Exchange as Client request owner
  participant Session as Server socket owner
  participant Supervisor as Existing lifecycle owner
  Caller->>Exchange: command variant, endpoint, deadline
  Exchange->>Session: JSON + newline, generated request id
  Session->>Session: decode, existing schema admission
  Session->>Supervisor: admitted request (unbound handler)
  Supervisor-->>Session: result or original error
  Session-->>Exchange: schema-projected response with original request id
  Exchange-->>Caller: result or control error
  Note over Session: each socket has one decoder; requests may execute concurrently
  Note over Exchange: owns only its timer/socket response, no business state or retry
```

Desktop continuous and browser replayable RPC still use the inherited RPC/Host
owners. This transport is the separate local Supervisor control endpoint. It
creates neither replay state nor a session, accepted queue, attachment or lease.
POSIX socket paths and Windows named pipes are passed to Node unchanged.

## Frozen external behavior

`encodeJsonLine(unknown): string` returns native JSON.stringify followed by one
newline, including native throws and the `undefined\n` result for undefined.
`JsonLineDecoder(options?: {maxFrameBytes?: number})` retains the original options
reference. Each push appends a string or the result of a **new**, nonstreaming
TextDecoder decoding a Uint8Array. Do not repair split multibyte characters.
The default maximum is the existing MAX_CONTROL_FRAME_BYTES. Read the live
nullish-defaulted option at the preflight and for every nonblank complete line.
Check the UTF-8 byte length of the entire pending string before asking whether it
contains a newline; reject an over-limit unterminated batch with
`JSONL frame exceeds maximum size`, retaining that batch. For complete lines,
trim whitespace, consume the line before validating/parsing it, skip blank lines,
check the trimmed UTF-8 length, then JSON.parse. Wrap parse failures as
`Invalid JSONL frame` with the original cause. Earlier values in a failing push
are not returned. A trailing unterminated suffix is not checked again in that
push. `finish()` throws `Incomplete JSONL frame` only for nonblank pending text
and does not clear it. No decoder reset, streaming UTF-8 or new frame policy.

`requestControl(endpoint, request, timeoutMs = 10000): Promise<unknown>` preserves
the distributive omission of id from every ControlRequest variant. Generate UUID,
connect to the unchanged endpoint, then create decoder and native result Promise.
Within its executor, schedule timeout, set utf8 socket encoding, and attach error,
data and connect callbacks in that order. Connect writes the encoded spread of
request followed by the generated id. No request schema validation is added.
Timeout destroys then rejects `Supervisor control request timed out`. Socket
error clears timeout and rejects the exact error without explicit destroy.
Each data callback decodes the **entire** batch but examines only its first
returned value; undefined or a schema-valid wrong id leaves the request pending.
Other returned frames from that batch are discarded. Schema parsing occurs before
id matching. A matching response clears timeout and ends the socket before
resolving result or constructing ControlRequestError. Failure defaults remain
`request-failed` / `Supervisor request failed`; retryable is passed unchanged.
Any synchronous exception inside data processing clears timeout, destroys and
rejects that exception unchanged. Preserve listeners and subsequent callback
effects after settlement; do not introduce end/close rejection, a settled guard,
retry, multiplexing or independent cancellation.

`createControlServer(endpoint, handler)` first best-effort removes the endpoint,
then best-effort mkdir of the prefix before its last `/`, or `.` when absent.
Create a Node server and a Set of accepted sockets. Admission adds a socket,
registers its once-close removal, then starts that socket's session. Listen waits
on a once-error reject callback and removes that callback only on ready; then
best-effort chmod 0600 and return `{server, close}`. Keep mkdir permissions and
endpoint interpretation unchanged, including their existing named-pipe behavior.

Each session registers error (destroy), sets utf8 encoding, registers data then
end. Decoder failure writes a generated-id `invalid-frame` response before
destroying; response-schema failure still propagates. Each decoded frame starts
an independent async dispatch in order without waiting for previous handlers.
The existing safeParse is the only admission gate. Invalid requests never call
handler and get a generated-id `invalid-request` / `Invalid control request`.
Valid handlers are invoked unbound with the admitted request object. Await their
result, then write a same-id success response. Handler or success-write failures
enter the same-id error response path. Typed ControlRequestError retains code,
message sliced to 500 UTF-16 units and own retryable field (even undefined);
other errors use `request-failed`, Error.message or String(error), sliced to 500.
End calls decoder.finish and destroys on any failure.

Every response goes through the existing response schema **before** destroyed or
writableEnded checks. Only socket.write/encoding errors are caught by best-effort
write cleanup; write callback errors destroy too. No error logging, auth policy,
serialization normalization, response retry or handler cancellation is added.

Close memoizes one underlying shutdown operation, while the public async wrapper
may return distinct assimilating Promises. Start server.close, destroy sockets in
live Set order, then race its callback against an unref'ed 2000ms timer. After
either outcome best-effort remove the endpoint. The existing timer is not
cleared on early callback completion. Preserve synchronous throws, rejection
memoization and the absence of a second lifecycle lock or handler drain.

## Deferred acceptance

Add focused fake-port regression scenarios for frame byte boundaries and retained
suffixes, per-socket admission/concurrent responses, matching-id/error projection,
timer ownership, callback failures and once-only listener shutdown. These are
newly authored scenarios, **not executed results**. No test, lint, types, format,
architecture checker, build, source-emitted matrix or full audit is run in this
stage, including synthetic tests. Only source reading, Git diffs, byte bindings
and remote commit/PR metadata are inspected.

No MIT determination follows. Preserve current attribution, all third-party
records, root licensing files and historic failures. Integration owns final
schema/consumer/platform verification and aggregate origin/rights review. The
root test entry currently omits server-cli; request inclusion of the new tests
from the integration owner without editing root scripts in this lane.
