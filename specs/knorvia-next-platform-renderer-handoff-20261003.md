# Renderer continuation on the fixed native lane

Continue `rewrite/native-20261003` / draft PR17, without another task, branch or
author. The parent explicitly transferred all `packages/desktop/src/renderer/**`
from UI to this lane. Read the UI record at exact PR15 head
`662b64276a7271324efcbc6de36497058250d521`; its complete candidates concern UI
package owners, not these renderer files. The thirteen specifically assigned
renderer files have identical current/handoff blobs and match their existing
source inventory bytes. No accepted complete replacement is recorded for them.
Do not import UI lane changes, rewrite their owners or touch packages/ui/web.

This is a bounded source selection, not a whole-directory origin audit. The same
source-exposed agent read the selected bodies to curate contracts and authors
the replacements. No isolated author, clean-room, independent rights acceptance
or MIT grant is asserted. Existing licenses, notices and global inventories stay.
Required JSX, visual tokens, protocol/literal data and ordinary adapter expressions
remain separately qualified even within a complete candidate.

## Explicit disposition

Reconstruct the substantive entry/lifetime/adapter portions in main.tsx,
databaseStartupAdmission.ts, userActionTraceBootstrap.ts, localTtftBootstrap.ts,
desktopPlatform.ts, desktopBrowserPlatformBridge.ts, resource-manager.tsx and
root-renderer cuaPermissionPanel.ts. New local appearance policy and preload call
router can express the common contract without a parallel business owner.

Retain five exact compatibility surfaces, with zero new reconstruction credit:

- performanceTimelineCleanup.ts: DEV-only once-per-module 10s native timeline
  mark/measure maintenance; no business timeline or collector algorithm.
- remoteWorkspaceSessionServices.ts: the required remote service selection table
  over a spread of local services; the actual RPC and service algorithms are
  existing owners. Preserve all remote overrides, including attachments, models,
  providers, plugins, skills, commands and hooks; no invented local fallback.
- remoteWorkspaceServicePortBridge.ts: thin existing envelope admission and ready
  serialization. It accepts any source, object+channel, nonempty string ids,
  truthy target and first port; it does not newly validate/normalize RemoteTarget.
  Ready remains same ids/channel and `*`, emitted after service registration.
- cuaPermissionPanelMessages.ts: exact bilingual copy and permission lookup.
  Copy is part of the requested UI and receives no new authorship credit.
- appTelemetryBridge.ts: one context factory evaluation followed by the supplied
  bridge call with its receiver. No separate telemetry owner or policy here.

None of these retained files becomes original/MIT by this decision. Integration
must decide the retained expression/rights disposition with their existing source
relationships. Rewriting forwarding or copy merely to inflate counts is excluded.

## Startup and appearance contract, before implementation

```mermaid
sequenceDiagram
  participant Preload
  participant Entry as Renderer startup owner
  participant Gate as State and port admission
  participant UI as Existing UI store and root
  Preload->>Entry: state / local port / scoped remote port
  Entry->>Gate: monotone same-startup state; one replaceable port
  alt local ready state and port share startupId
    Gate-->>Entry: consume the one matching port
    Entry->>UI: connect local services and register base
    Entry->>UI: register queued remote services in arrival order
    Entry->>Preload: scoped ready after each successful registration
    Entry->>UI: render the same business JSX
  else not admitted
    Entry->>UI: render the same loading JSX on accepted state
  end
```

One entry owner holds initialized state, base accessor, pending remote FIFO and
first-state timeout. One admission owner holds accepted state and one offered
port resource; the UI never becomes an admission authority. Retain public mutable
state and the three admission methods. Same startupId sequences <= current are
rejected; a different startupId is admitted regardless of sequence. Invalid port
payload closes only the incoming port. A valid replacement closes the previous
port only when its object differs, before installing the new offer; close errors
propagate and leave the previous offer. Ready requires phase ready and equal id;
consumption removes the offer without closing the transferred port.

Keep module execution order: timeline cleanup; launch timestamp/query/global marks;
gated dynamic E2E import; appearance/chrome flags; query settings; platform creation;
admission/root/timer; message listener; startup render; snapshot control. Preserve
30s timeout with the exact failure state, timestamps, error code and no later
automatic timer rearm. Timer does nothing if any state already exists. A valid
accepted state clears timer, renders loading, then tries entry; ready alone is
insufficient. Even after initialized, the state schema is evaluated before return.
Once entering, latch before connect, install base before registration/remote flush,
drain FIFO with splice before callbacks, then render business root. Existing thrown
errors propagate; do not introduce implicit disposal/retry/reentrancy behavior.

Event precedence stays startup state from window, notification sound regardless
of source, remote envelope regardless of source, local port from window. Remote
ports before local admission remain queued in order. New remote registration uses
one existing MessagePort service connection, exact remote selection table, existing
store registration and its disposer (nullish reason -> existing disconnected error).
Only then notify ready; no acknowledgment for a failed registration. Desktop
delivery stays continuous; no mobile replay, new Host, session cache or schema.

Keep every JSX component, child order and prop meaning. Startup locale override,
setting/broadcast services, error boundary, notifier, Root flags, workspace paths,
purpose and restore flags stay exact. Retry reads the live accepted attempt; copy
and exit retain the same ports. First React effect still records commit timestamp
then emits the same startup-shell event. Do not wire currently unused telemetry
bootstrap exports into main or invent an additional Root/Host.

Theme policy keeps aliases light/dark -> knorvia-light/dark, system matchMedia,
unknown/empty theme behavior, default white and all class tokens. Main uses `||`
default, resource manager `??`; main only adds dark while resource always toggles.
Chrome flags and their class updates remain Mac, Windows, otherwise Linux, in
that order. No CSS/HTML/asset/layout/text change. Resource manager still applies
theme then persisted font size then storage subscription before checking root;
no main settings/RPC/Zustand owner is created. Its JSX, raw sampling callback,
optional storage and lazy live bridge snapshot callback remain identical.

## Deferred acceptance

Author focused supplied-port startup/telemetry/adapter/drag cases only, unrun.
No tests, lint, types, formatting/architecture checks, build, full audit or native
application operation in this phase. Source reads/diffs and exact byte/Git/remote
metadata only. Final integration must combine PR15 UI, root/preload/startup schema,
RPC/Host registration, actual Electron transfer and Mac/Windows/Linux chrome,
resource manager persistence, browser/native drag and telemetry consumers. Shared
interfaces/configuration/provenance are integration-owned; no interface change is
requested. Freeze this finite thirteen-file selection after meaningful code batches.
