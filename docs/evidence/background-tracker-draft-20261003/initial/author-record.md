# Background tracker initial author seal

Author closure UTC: 2026-10-03T03:14:49.722200060Z
Whole source-set binding: 70556cb2f37d4c69a77fef92941b0ac3a1813e55fc1794982657a1eb6c1bfb15  SHA256SUMS
Per-source exact SHA256 bindings: SHA256SUMS
Exact accessed packet input bindings: accessed-inputs.sha256

## Deliverables and design

The initial source set contains the complete core/src/tool/executor/background-tasks.ts owner and two cohesive private modules in that folder: background-tracker-projection.ts and background-tracker-notification.ts. Only BackgroundTaskTracker is exported by the public owner module. Existing dependencies are imported by their supplied logical module paths and remain unchanged.

The tracker retains live deps and owns the one shared task-ID reservation set plus each admitted attempt's overlap flags, stopped flag, signature, interval, and optional timeout. The public owner implements admission, registration/publication boundaries, source absence, independent polling/publication exclusion, immediate poll and detached waiter, timeout cancellation, terminal handling, and cleanup. The projection module resolves provider capabilities anew, preserves captured methods/live or captured receivers according to dispatch, and implements native snapshot/wait/event async boundaries and exact event payloads. The notification module implements authority/policy/claim/release ordering, Bash/workflow text projection, supersession suppression, and dynamic workflow terminal manifests with prescribed truncation and field order.

No new registry, grant, retry, termination policy, cache, generation barrier, async gate, or automatic repair of late-running/stranded behavior was introduced. The retained fixed strings and ordinary primitive forms implement compatibility requirements and are not claimed as independence credit.

## Received functional clarifications

The parent supplied functional clarifications without predecessor code, explicitly described as source-derived:

1. Import SessionEventType from @knorvia/contracts and use its BackgroundTaskStarted, BackgroundTaskUpdated, and BackgroundTaskCompleted values. Every catalog log includes toolName except polling failed, wait failed, and notification enqueue failed. Specified exception records use errorMessage. Queue-unavailable/suppressed/skipped/already-claimed/enqueued records include raw taskStatus.
2. Bash formatTaskNotification.description is only string input.description, otherwise explicit undefined; the summary has its independent description/command/default subject fallback. Workflow description is the resolved subject.
3. The workflow summary's final completed/failed branch uses normalized raw status after lost/errored/stopped-or-killed branches. Declared terminal facts still control manifest status, including raw failed plus declared completed.
4. The Agent/Task notification skip checks exact top-level snapshot.type === 'local_agent' and snapshot.notified === true structurally, despite type not appearing in the supplied declaration. It does not inspect snapshot.output or change declarations.

These clarifications are part of the actual authoring inputs and were incorporated during drafting before sealing. No predecessor body was shown or accessed for them. No real functional ambiguity remains; integration and comparison are the curator's next steps.

## Actual access and limits

Current-task repository reads were limited to the eight exact packet files in /workspace/knorvia-studio/docs/evidence/background-tracker-author-20261003: api.d.ts, call-api.d.ts, ports.d.ts, snapshot-api.d.ts, dependency-api.d.ts, import-map.md, runtime-logs.json, and contract.md. They were read together for authoring, then reread only for input SHA256 binding. Owned draft source files were read for pre-seal drafting adjustments and SHA256 binding; the owned source-hash manifest was read for the whole source-set digest. Writes were confined to this draft-01 directory, and the listed source/record/hash files were made read-only after closure.

No predecessor source/history, compiled dependencies, oracles, tests, old receipts, git data, production files, other repository files, network, provider/model calls, or authored-code runtime/compilation was accessed or executed. Shell/interpreter filesystem operations were used only for packet reads and owned draft creation, adjustment, clock recording, hashing, and permissions. No production, packet, or test edit occurred. No additional agents or tasks were launched and no model/reasoning/access/environment settings were changed. Sol/high and current Fast ON remain parent-reported settings, without an independent settings query.

This same executor/conversation previously carried AgentRuntime and TurnMachine packet-author assignments. Their packet contents, drafts, and outcomes remain inherited conversational context. The parent reported the TurnMachine candidate rejected/uninstalled. Neither prior draft was reopened or revised during this assignment. Thus this is not an absolute packet-only, clean-room, or license claim. Shared-filesystem restrictions were instruction-only, not enforced isolation.

This is the sealed initial whole draft before curator compilation/comparison. No formatting, compilation, tests, or comparison occurred before closure. No post-seal author revision is part of this source set. Await curator handling of integration, failures, and comparison.
