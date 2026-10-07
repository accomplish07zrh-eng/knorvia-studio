# Studio Agent tools and durable child receipts

Scope: desktop/server Studio execution only; mobile is excluded. Independently written from the current Knorvia contracts, without importing another project's agent engine. The existing command admission, leased run executor, kernel adapters and workspace manager remain the execution owners.

## Trusted caller and one path

A Host issues a short-lived MCP grant only for an existing running Studio turn. Its run, step, attempt, effective permission and cancellation signal come from the executor, never tool arguments. Every call rechecks that turn, executor lease and attempt. Child task records retain their creating parent run/attempt. Durable ownership belongs to the persisted member/conversation identity across later parent turns and a user-approved continuation; active grants remain fenced to the current turn/attempt; status, messaging, cancellation, results and event ACKs reject another caller. Child runs inherit only the chain identity and depth, never a provider/model/account configuration. Native Knorvia CLI Agent/Task profiles remain independent; these Host tools operate configured Studio kernels.

Tools: `list_kernels`, `dispatch_task`, `message_task`, `get_task`, `get_result`, `request_permission`, `cancel_task`, `get_events`, `ack_event`. Runtime schemas reject extra keys, credentials, paths, arbitrary executable/account configuration and approval answers. Dispatch explicitly requires task and context briefs and a configured, installed selected kernel. Explicit model/reasoning values must appear in that kernel's options. Defaults come from that kernel's stored configuration. The stricter parent/configured/requested permission wins. Read-only requires actual kernel support; unsupported adapters are rejected. Ask-mode dispatch waits on the existing human approval channel. `request_permission` may request/observe a human decision, never answer or grant any native approval. Unknown side effects require the user's existing Studio resume policy; no agent tool can authorize uncertain retries.

Write-capable children use `StudioWorkspacePort.prepare(mode: isolated)` before creating an owned conversation. Later messages reuse that conversation and native session; busy messages enter the existing durable queue. Dispatch uses the same admission receipts inside one transaction, with task ownership and operation receipt committed together. Caller-member/conversation/command ID receipts survive a parent continuation. A durable sent receipt precedes asynchronous preparation; an uncertain restart never starts a second child. Sent, accepted, running, completed, failed, needs-input, cancelled and cancel-unconfirmed are distinct receipts/projections. Cancellation ACK means requested; only a known native terminal confirms cancellation.

## Bounded policy

Host configuration, never child text, owns limits. Defaults: four active children per chain, sixteen total children, depth two, eight messages per child, three native attempts, fifteen-minute execution deadline, ten notification deliveries and one-second retry. Zero/negative/non-integer limits fail configuration. Child calls cannot expand those limits. Timeout persists cancellation and retains uncertainty if the native process cannot confirm it. Notifications do not create native runs or additional agents.

## Outbox and results

Task/run/attempt/event is the immutable event key. The terminal or needs-input transition and the outbox entry commit in the same SQLite transaction. A result reference freezes all step results, output artifact references and physical workspace references for that attempt; complete text stays retrievable independently of checkpoint/UI truncation. `get_result` also supports bounded text and artifact pages with explicit offsets, totals and completion markers when a native client limits tool output. Existing `step-result` records remain executor-owned; snapshots are immutable derived receipts. An old attempt cannot settle a newer run or overwrite its notification/result.

`get_events` sends pending entries with a delivery count and retry deadline. `ack_event` is idempotent and caller-scoped. Lost ACK replays the same event ID after the deadline, including after Host restart; exhausted delivery remains visible for manual inspection rather than being silently dropped. A deduplicated system progress message exposes every event in the existing Studio timeline. The private MCP child transport receives `KNORVIA_STUDIO_AGENT_URL` and `KNORVIA_STUDIO_AGENT_TOKEN` only from its Host-issued grant; these are not user configuration, have no account/environment fallback and are revoked when the turn ends. Native MCP has no portable unsolicited model-message facility: the agent receives completion/needs-input through `get_events` and retrieves full results by reference. The UI message is observability, not an execution or delivery ACK.

```mermaid
sequenceDiagram
  participant Parent as Existing Studio turn
  participant Tools as Caller-scoped Host tools
  participant DB as Existing SQLite admission/outbox
  participant Exec as Leased Studio executor
  participant Kernel as Configured kernel
  Parent->>Tools: dispatch(command ID, task/context, kernel)
  Tools->>DB: reserve sent receipt
  Tools->>Tools: validate capability/options; human gate; isolate workspace
  Tools->>DB: atomic conversation + send + owned task + accepted receipt
  Exec->>Kernel: existing run/step/attempt dispatch
  Kernel-->>Exec: known terminal / uncertainty / human interaction
  Exec->>DB: fenced state + immutable result + event
  Parent->>Tools: get_events (replay same ID until ACK)
  Tools-->>Parent: event + full result reference
  Parent->>Tools: get_result; ack_event
```

No schema migration: new kinds use the existing generic entity table, old records do not change. No mobile, live provider/account setup, signing, release/version or merge changes. Integrator owns publication. Common-file integration surface: contract/type exports, commandAdmission transaction helper, run/turn attempt fences, interaction terminal hooks, runtime tick/recovery and sharedCapabilities bridge injection.

The current bridge injects tools into local Studio turns through existing per-turn MCP projection. SSH-selected dispatch is explicitly unsupported by this tool surface pending the environment lane's ownership bridge. Antigravity has no per-turn MCP entrypoint. A packaged Host must provide a Node-capable executable for the stdio transport; account/provider execution and packaged Windows/macOS acceptance are integration checks.

## Acceptance

Offline fake adapters plus real SQLite: duplicate/concurrent commands, changed payload rejection, duplicate transitions, lost ACK and restart replay, stale attempt settlement, caller/ownership denial, unsupported read-only and model options, human-only approvals, cancel retry/uncertainty, isolated reuse, depth/fanout/message limits, execution deadline and full text/artifact retrieval. Run format, generated provenance/check, root lint/types, architecture and targeted runtime tests. Native provider/account calls are excluded.
