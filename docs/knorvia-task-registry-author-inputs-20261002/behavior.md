# Runtime task registry: behavior-only authoring contract

Implement the class and two functions declared in `api.d.ts`. Read only this file,
`api.d.ts`, `supporting-types.d.ts` and `inputs.json`. No predecessor source, history,
compiled artifacts, other project files or previous design proposals are inputs.
Internal storage and algorithm choices are open. Equal complexity is acceptable;
do not infer a prescribed map layout, observer representation or helper structure.
Return original executable expression, retaining the fixed API and error string.
There is no new permission, retry, cancellation, generation-fencing or task policy.

The registry stores metadata and wait subscriptions. It does not execute tasks,
send messages, create sessions, read files, generate ids/timestamps or call sinks.
All supplied nested metadata and ports are opaque; preserve references unless a
specified shallow-copy operation changes a top-level field. Methods are synchronous
except for returning native promises from the two waits. Subscription setup occurs
before those methods return; do not add asynchronous wrappers or deferred setup.

## Snapshot and message operations

| Operation                      | Observable behavior                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Construction                   | Empty registry; default active branch generation is zero.                                                                                                                                                                                                                                                                                                                           |
| `setActiveBranchGeneration(g)` | Set the default for later registrations only. No validation, existing-record mutation, observer release or fencing.                                                                                                                                                                                                                                                                 |
| `register(task)`               | Make a shallow enumerable own-property copy. Preserve supplied `branchGeneration` unless nullish, when the active default is used. Preserve all nested references. Store under the copied `taskId`, replacing any record with that id without moving its existing enumeration position. Then publish terminal observations before background observations as described below.       |
| `update(id, patcher)`          | Missing id returns undefined without invoking patcher. Otherwise call it once synchronously with the exact stored object. Store its exact returned object under the requested id, even if its `taskId` differs. Publish terminal then background observations and return that object. A thrown patcher leaves the outer update uncommitted; its own reentrant effects are retained. |
| `get(id)`                      | Return the exact stored snapshot or undefined.                                                                                                                                                                                                                                                                                                                                      |
| `all()`                        | Fresh ordinary record with own enumerable id properties and original snapshot references. Preserve task insertion order, subject to standard JavaScript object integer-key ordering. `__proto__` is an own property, not a prototype mutation. Delete then re-register moves an id to the new insertion position.                                                                   |
| `remove(id)`                   | Delete the stored snapshot first. Release terminal observers with undefined, then background observers with undefined, including id-scoped subscriptions that exist without a current record. No task cancellation or notification.                                                                                                                                                 |
| `requestBackground(id)`        | Missing or terminal record returns false unchanged. Otherwise store a shallow enumerable copy with `isBackgrounded: true`, release background observers with that exact copy and return true. Repeated successful requests still copy/publish. No type-specific admission rule.                                                                                                     |
| `queueMessage(id, message)`    | Invoke the public `update` method once, allowing its receiver's override. Its patcher preserves snapshot fields and replaces pendingMessages with a fresh ordered array containing the prior messages then the exact supplied reference. It does not call the sink. Return the update result.                                                                                       |
| `drainMessages(id)`            | Missing/absent/empty messages returns a fresh empty array without updating the snapshot. Otherwise return the original messages array and store a shallow snapshot copy with a fresh empty array. Do not publish observations or invoke public update.                                                                                                                              |

Shallow copies preserve ordinary property enumeration and field positions; an overridden
existing field keeps its position and a newly introduced field follows existing fields.
No clone/normalization of dates, output, usage, trace, message or session metadata.

## Classification and immediate waits

Terminal statuses are exactly `completed`, `failed`, `cancelled`, `killed`, `stopped`,
`lost`. `isTerminalRuntimeTask` checks that vocabulary without coercion or type gates.
`hasRunningBackgroundRuntimeTask` calls the supplied registry's `all()` once and returns
whether any value has `isBackgrounded === true` and `status === "running"`.

Both waits inspect current state before inspecting options/signal. For terminal wait,
a missing id resolves undefined and a terminal id resolves its exact object immediately.
For background wait, missing resolves undefined; already-backgrounded resolves the exact
object, including a terminal backgrounded object; terminal without that flag resolves
undefined. These immediate paths ignore an already-aborted signal and must not access
throwing options/signal getters. Otherwise create a distinct pending native promise.

## Pending waits and observable publication

- Waits are scoped to id, not a snapshot object, branch generation or task type.
  Re-registering an id preserves pending observers. A patcher's reentrant remove/register
  takes effect before the outer update stores and publishes its returned object.
- Options/signal/aborted reads on the pending path happen synchronously. An already
  aborted signal yields a rejected promise with its exact non-nullish reason; the
  fallback is a new Error with message `Runtime task wait aborted`. Exceptions in those
  synchronous reads propagate synchronously, rather than becoming promise rejections.
- For a pending signal, install one `abort` listener with `{ once: true }` before the
  subscription becomes eligible for publication. A throw during listener installation
  rejects the returned promise with that same error. Do not fabricate rollback of
  effects performed by the supplied port. No listener for an absent signal.
- Abort removes that observer's eligibility and rejects with the same reason/fallback.
  It does not explicitly call removeEventListener; the native once-listener behavior is
  retained. Other observers and the stored snapshot remain unchanged.
- A terminal publication releases terminal observers with the committed object and
  pending background observers with undefined, even if that object is backgrounded.
  A nonterminal background publication releases background observers with that object.
  Terminal release is followed by background release before any subsequent background
  publication from the same register/update. Snapshot commit precedes all publication.
- A publication detaches the eligible cohort before calling its listener cleanup.
  Within a cohort, preserve subscription order: remove that observer's abort listener
  (same listener identity), then resolve its promise, then process the next observer.
  Promise continuations use native settlement timing. Reentrant cleanup can create a new
  cohort or replace/delete the id; it cannot append observers to the detached cohort.
- A throwing listener cleanup propagates synchronously from register/update/remove/
  requestBackground. The prior snapshot mutation and cohort detachment remain; the
  throwing observer and remaining members of that detached cohort are not resolved.
  Do not recover them in a later publication or wrap/translate the error.
- Preserve reentrant admission: if listener installation deletes/replaces the task,
  subscription admission after installation returns still belongs to the id. It is
  released by a later publication/removal of that id. Inline abort can reject the native
  promise before admission finishes; do not introduce a new post-install abort policy.

Private representations are not observable contracts. Public effects, receiver calls,
read/cleanup order, identities and partial failure boundaries above are contracts.
There is no deadline or scheduled cleanup. Do not add retries or implicit task stops.

Accessor compatibility is not permission to normalize inputs. Registration evaluates
enumerable property values before reading the original branchGeneration for stamping.
Publication reads status before its terminal notifications, then reads isBackgrounded
afterwards. Background wait first reads isBackgrounded; if falsy, it reads status. Once
it takes an immediate path, it reads isBackgrounded again for the returned value. Flags
on these registry paths use truthiness; the exported running-background helper alone
requires literal true. A nonempty drain reads pendingMessages for presence, length and
returned identity before copying the snapshot; empty drains do not copy. The running-
background helper materializes all record values before its short-circuit scan, reading
each flag before reading status only for literal-true flags. Pending wait reads the
signal and aborted flag before constructing its subscription promise; listener cleanup
uses the signal as receiver and exactly the original event/listener pair, without a
third options argument. These are observable read/effect constraints, not storage advice.

## Evidence and limits

`inputs.json` translates an existing synthetic TaskOutput/registry caller observation
into data; it is not a new suite. Other transition/error rules above are source-derived
functional requirements, not newly executed or exhaustively frozen observations.
The curator has read the predecessor. Public declarations and fixed vocabulary are
retained API material; old explanatory prose and implementation bodies are excluded.
Restricted author input access must be recorded factually. No absolute clean-room,
whole-file independence, contributor-rights or MIT conclusion is authorized.
