# Clarifications delivered during the initial draft

The eight frozen inputs remain unchanged. The curator inspected predecessor source and delivered these additional functional facts to the existing native author before its draft closure. These are source-derived clarifications, not evidence of packet-only authorship or erased exposure.

- Import `SessionEventType` from `@knorvia/contracts` and use its `BackgroundTaskStarted`, `BackgroundTaskUpdated` and `BackgroundTaskCompleted` members; do not hardcode event strings.
- Log facts include `toolName: toolCall.name` except for polling failure, wait failure and notification enqueue failure. Tracking-start logs include both capability booleans. Terminal-observed and notification records include raw `taskStatus`; cancellation and other exception records include `errorMessage`.
- Bash notification `description` is the string `input.description`, otherwise undefined. Its summary fallback is independent. Workflow notification `description` is the resolved workflow subject. Preserve ordered key presence.
- After lost/errored/stopped-or-killed workflow summary branches, the final completed/failed choice uses normalized raw status. Raw `failed` plus declared `runStatus: completed` produces a failed summary while the manifest status remains completed.
- The already-notified Agent/Task check reads the structural top-level snapshot fields `type === local_agent` and `notified === true`, not `snapshot.output`; no public snapshot declaration is changed.

The author requested the event/log and description clarifications. Its access record must disclose receipt of these messages and inherited prior author context. No implementation bodies were sent in these messages.
