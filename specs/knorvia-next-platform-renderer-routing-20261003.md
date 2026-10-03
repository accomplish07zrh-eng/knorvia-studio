# Renderer native/browser routing and permission gesture owner

Continue on native PR17 after telemetry commit
cd0c79cc1629cb62dfe00a4c406d52f198cb8f7d. Select complete desktopPlatform.ts,
desktopBrowserPlatformBridge.ts and renderer-root cuaPermissionPanel.ts.
All match the assigned UI handoff and existing upstream-modified records, with
no accepted complete replacement. Keep UI, native/preload/shared/Host boundaries,
every existing capability and fallback. No newly exposed capability is requested.

~~~mermaid
flowchart LR
  UI[Existing IPlatformService consumers] --> Routes[Fixed capability and route data]
  Routes --> Calls[One preload invocation policy]
  Calls --> Native[Live window.knorvia receiver and method]
  OS[Native drag end / page mouseup] --> Gesture[One permission gesture phase]
  Gesture --> Panel[Existing dedicated permission preload]
~~~

## Adapter policy and retained data

One stateless local invocation policy expresses required calls, optional calls
and capability snapshots. No service/session/browser state or IPC is added here.
Every required delegate reads the live window.knorvia and method on invocation,
retains that object as receiver, forwards the original fixed argument count and
returns the native value/Promise identity. Ignore extra arguments and preserve
undefined positional arguments and function arity0..3. Do not bind a stale preload,
await/wrap native results, catch native failures or clone payloads.

Optional calls skip only nullish methods, and use the exact fresh fallback only
when the call result is nullish. False,0,empty string and existing Promise identity
are retained. Missing event subscriptions return a fresh no-op disposer each call;
empty arrays/result objects/Promises are also fresh per fallback. Conditional
capabilities sample truthiness only at platform creation (browser print at module
creation); retain undefined for absent capabilities. Existing configured methods
still perform their live required/optional policy later, not the snapshot function.

The public property set, insertion order, native key correspondence, arities and
all fallback packets are required compatibility data. Keep browser spread at its
existing position. The IPlatformService/public preload declarations are retained,
not reauthored. Local callable type projection may use IPlatformService; global
client declarations currently omit previewLocalDiagnostics, exportLocalDiagnostics
and checkReleaseUpdate despite their real preload implementations. Preserve all
three routes; report this existing declaration dependency for final integration,
without a shared/global declaration change or a type-check pass claim.

Mandatory/optional route classification remains exactly the selected source:
file/remote/MCP/native commands/notification/window/update/editor/system operations
remain complete. Community/feedback still use existing DesktopCommandIds through
executeDesktopCommand. ARMS records E2E first then reads/invokes native report.
Device ID still reads the renderer global with nullish empty fallback. System
locale fallback still uses navigator language lowercased zh-prefix; theme/window
glass, startup callbacks, diagnostics, heap/TTFT/action trace and all release/zoom/
chrome/settings capabilities retain their existing behavior. Do not expose
cancelCuaPermissionOnboarding or syncTelemetryContext merely because preload has it.

Browser File must pass instanceof File before the optional native path call.
Print capability remains undefined for old preload. Keep all seven browser events
and guest attach/detach/close/residency/suspend/ensure/restore/viewport operations;
exact attach not-found/recoveryRequested, detach false, restore empty array,
unsupported save/clear/import packets and import statistics remain fixed. No
browser logical state, data transfer, clearing, permission or session mutation is
performed by this lane; delegated owners continue to hold those responsibilities.

## Dedicated CUA panel

One private gesture owner holds idle/dragging phase; one DOM projection applies
existing messages to captured nodes. Capture dedicated bridge, then tile, prefix,
permission label, suffix, completion and icon in their original order. Mount
warms helper with optional prepareDrag, observes helper display name on completion
via a fresh appName lookup and ignores Promise rejection; synchronous throws
retain their original boundary. Do not await preparation during the gesture.

Then subscribe to bridge state and install dragstart, dragend, document mouseup,
in that order. Each state resolves the retained message table first, sets document
lang/title, tile title, four text nodes and finally icon background only for truthy
iconDataUrl. Preserve exact bilingual text, permission lookup, node references,
style expression and placeholder persistence when icon missing. No HTML/CSS/assets,
geometry, focus, locale storage, permission-grant policy or new controls.

Dragstart preventDefault precedes changing phase, then synchronously call captured
bridge.startDrag with its receiver; no await, timer, permission prompt or native
file operation is added. Either dragend or mouseup ends only an active gesture;
transition to idle before notifyDragEnded. Plain clicks do not dismiss and duplicate
end signals do not repeat notification. Preserve a started phase when startDrag
throws, current optional bridge semantics and lifetime subscriptions; do not add
an unrequested teardown/mount retry or another permission authority.

## Deferred evidence and finite freeze

Same source-exposed author; route/copy/data/public/native expressions remain
qualified pending full expression/rights/MIT review. Bind complete drafts before
source diff; retain five selected thin surfaces at their original bytes. Author
two focused supplied-preload/File/DOM/event scenarios, unrun. No tests, lint, types,
build, format/architecture checks, full audit or actual Electron/system/user-data
operation. Final integration owns old/current preload, public declarations,
browser/native gesture, UI/root/Host consumers and multi-platform acceptance.
After this batch and metadata/remote confirmation, freeze the assigned thirteen
renderer entries on the existing task/branch/draft PR; do not broaden the scope.

## Authorized client declaration follow-up

The parent confirmed packages/client/** belongs to this same lane and authorized
closing the declaration gap after checkpoint124ed9e32715e6e0fb2caf1b1aa5bd8eac2de83e.
Change only packages/client/src/globals.d.ts by adding the three existing keys to
its existing Required<Pick<IPlatformService,...>> native surface. Actual preload
always exposes these methods; reuse the exact shared signatures:

| Method | Existing runtime/shared signature |
| --- | --- |
| previewLocalDiagnostics | (request: LocalDiagnosticRequest) -> Promise<LocalDiagnosticPreview> |
| exportLocalDiagnostics | (id: string) -> Promise<LocalDiagnosticExportResult> |
| checkReleaseUpdate | () -> Promise<ReleaseUpdateCheckResult> |

All types come from the existing shared public entry. No new schema, wire channel,
capability, runtime behavior, renderer/preload implementation or data operation.
This closes the static declaration omission only; no new algorithm/origin/MIT
credit and no type-check/consumer acceptance. Source diff/byte/Git/PR metadata only,
no tests/lint/types/build/other verification. The server-cli runner remains for
final integration as instructed.
